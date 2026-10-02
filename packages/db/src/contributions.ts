import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { createDb } from "./index";
import { effectiveStatus, type PersonStatus } from "./people";
import { user } from "./schema/auth";
import {
	type ContributionStatus,
	contribution,
	contributionCall,
} from "./schema/contribution";

type Db = ReturnType<typeof createDb>;

/*
 * Every read and write of the two contribution tables lives here, the way
 * `people.ts` owns the `user` table. The arithmetic at the top is pure so it
 * can be tested without D1.
 */

export type Tally = {
	/** paid + unpaid. The excused are not billed, so they are not in here. */
	billed: number;
	paid: number;
	unpaid: number;
	excused: number;
	/** Dollars in hand. */
	collected: number;
	/** Dollars the billed would add up to. */
	expected: number;
};

/**
 * The excused are out of both numbers on purpose: "14 of 22 paid" has to be
 * a fraction somebody can close, and somebody the host let off is not
 * somebody who still owes.
 */
export function tally(
	rows: { status: ContributionStatus }[],
	amount: number,
): Tally {
	let paid = 0;
	let unpaid = 0;
	let excused = 0;
	for (const row of rows) {
		if (row.status === "paid") paid += 1;
		else if (row.status === "excused") excused += 1;
		else unpaid += 1;
	}
	const billed = paid + unpaid;
	return {
		billed,
		paid,
		unpaid,
		excused,
		collected: paid * amount,
		expected: billed * amount,
	};
}

/** Whole dollars with the comma a four-figure venue rental earns. */
export function dollars(n: number): string {
	return `$${Math.round(n)
		.toFixed(0)
		.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** "14 of 22 paid, $560 of $880." -- plus the excused, only when there are any. */
export function tallyLine(t: Tally): string {
	const line = `${t.paid} of ${t.billed} paid, ${dollars(t.collected)} of ${dollars(t.expected)}.`;
	return t.excused > 0 ? `${line} ${t.excused} excused.` : line;
}

export type CallRow = {
	id: string;
	subject: string;
	body: string;
	amount: number;
	instructions: string;
	sendId: string | null;
	openedBy: string | null;
	openedAt: Date;
	lastRemindedAt: Date | null;
	closedAt: Date | null;
};

/** The call being tracked right now, if any. There is never more than one. */
export async function findOpenCall(db: Db): Promise<CallRow | null> {
	const row = await db
		.select()
		.from(contributionCall)
		.where(isNull(contributionCall.closedAt))
		.limit(1)
		.get();
	return row ?? null;
}

/** The newest call, open or closed. Its amount and instructions prefill the next. */
export async function findLatestCall(db: Db): Promise<CallRow | null> {
	const row = await db
		.select()
		.from(contributionCall)
		.orderBy(desc(contributionCall.openedAt))
		.limit(1)
		.get();
	return row ?? null;
}

export type LedgerRow = {
	userId: string;
	name: string;
	email: string;
	status: ContributionStatus;
	markedAt: Date | null;
	/**
	 * Where the person stands on the roster today. A man on a break still
	 * owes but hears no reminder; a deactivated one is history on the page,
	 * not a row that vanishes and throws the tally off.
	 */
	personStatus: PersonStatus;
};

/** Everybody billed on a call, with their roster status alongside. */
export async function listLedger(db: Db, callId: string): Promise<LedgerRow[]> {
	const rows = await db
		.select({
			userId: contribution.userId,
			name: user.name,
			email: user.email,
			status: contribution.status,
			markedAt: contribution.markedAt,
			personStatus: user.status,
			suspendedUntil: user.suspendedUntil,
		})
		.from(contribution)
		.innerJoin(user, eq(user.id, contribution.userId))
		.where(eq(contribution.callId, callId))
		.orderBy(asc(user.name))
		.all();
	return rows.map(({ suspendedUntil, personStatus, ...row }) => ({
		...row,
		personStatus: effectiveStatus({ status: personStatus, suspendedUntil }),
	}));
}

/** The ids still on the unpaid side of a ledger. */
export function unpaidIds(
	ledger: { userId: string; status: ContributionStatus }[],
): string[] {
	return ledger.filter((r) => r.status === "unpaid").map((r) => r.userId);
}

/**
 * Closed calls, newest first, each with its final numbers. The tally is
 * added up here rather than in a correlated subquery: on a single-table
 * `from`, drizzle leaves the inner column names unqualified and the sum
 * quietly comes out zero.
 */
export async function listClosedCalls(
	db: Db,
	limit = 20,
): Promise<(CallRow & { tally: Tally })[]> {
	const calls = await db
		.select()
		.from(contributionCall)
		.where(isNotNull(contributionCall.closedAt))
		.orderBy(desc(contributionCall.closedAt))
		.limit(limit)
		.all();
	if (calls.length === 0) return [];
	const rows = await db
		.select({ callId: contribution.callId, status: contribution.status })
		.from(contribution)
		.where(
			inArray(
				contribution.callId,
				calls.map((c) => c.id),
			),
		)
		.all();
	return calls.map((call) => ({
		...call,
		tally: tally(
			rows.filter((r) => r.callId === call.id),
			call.amount,
		),
	}));
}

export type OpenCallInput = {
	id: string;
	subject: string;
	body: string;
	amount: number;
	instructions: string;
	openedBy: string | null;
	/** Exactly who `listRecipients(db, "active")` returned. The snapshot. */
	userIds: string[];
};

/**
 * The claim. The call and its whole ledger land in one D1 batch, which is
 * one transaction: either everybody is billed or nobody is. The ledger goes
 * in twenty rows a statement because D1 allows a hundred bound parameters
 * per statement and three columns times a full roster is more than that.
 */
export async function openCall(db: Db, input: OpenCallInput): Promise<void> {
	const { userIds, ...call } = input;
	const first = db.insert(contributionCall).values(call);
	const rest = chunk(userIds, 20).map((ids) =>
		db.insert(contribution).values(
			ids.map((userId) => ({
				id: crypto.randomUUID(),
				callId: call.id,
				userId,
			})),
		),
	);
	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		first,
		...rest,
	];
	await db.batch(statements);
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/** The release: a call whose email never left. The cascade takes the ledger. */
export async function discardCall(db: Db, id: string): Promise<void> {
	await db.delete(contributionCall).where(eq(contributionCall.id, id));
}

/** Point the call at the `email_send` row that is the record of the send. */
export async function attachSend(
	db: Db,
	id: string,
	sendId: string,
): Promise<void> {
	await db
		.update(contributionCall)
		.set({ sendId })
		.where(eq(contributionCall.id, id));
}

/** True when the person was billed on that call; false is "no such row". */
export async function markContribution(
	db: Db,
	input: { callId: string; userId: string; status: ContributionStatus },
): Promise<boolean> {
	const result = await db
		.update(contribution)
		.set({ status: input.status, markedAt: new Date() })
		.where(
			and(
				eq(contribution.callId, input.callId),
				eq(contribution.userId, input.userId),
			),
		)
		.run();
	return result.meta.changes === 1;
}

/** Only a real send calls this; a preview or a test copy is not a reminder. */
export async function markReminded(db: Db, id: string): Promise<void> {
	await db
		.update(contributionCall)
		.set({ lastRemindedAt: new Date() })
		.where(eq(contributionCall.id, id));
}

/** Close the books. False means they were already closed. */
export async function closeCall(db: Db, id: string): Promise<boolean> {
	const result = await db
		.update(contributionCall)
		.set({ closedAt: new Date() })
		.where(and(eq(contributionCall.id, id), isNull(contributionCall.closedAt)))
		.run();
	return result.meta.changes === 1;
}

export type MyContribution = {
	callId: string;
	subject: string;
	amount: number;
	instructions: string;
	status: ContributionStatus;
	openedAt: Date;
};

/**
 * One person's own row on the open call, or null: no open call, or they were
 * not on the list when it went out. This is the only read a guest gets, and
 * it never says anything about anybody else.
 */
export async function findMine(
	db: Db,
	userId: string,
): Promise<MyContribution | null> {
	const row = await db
		.select({
			callId: contribution.callId,
			subject: contributionCall.subject,
			amount: contributionCall.amount,
			instructions: contributionCall.instructions,
			status: contribution.status,
			openedAt: contributionCall.openedAt,
		})
		.from(contribution)
		.innerJoin(contributionCall, eq(contributionCall.id, contribution.callId))
		.where(
			and(eq(contribution.userId, userId), isNull(contributionCall.closedAt)),
		)
		.limit(1)
		.get();
	return row ?? null;
}
