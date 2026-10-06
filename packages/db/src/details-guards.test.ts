import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { dietWritable, editable, fillable } from "./details";
import { user } from "./schema/auth";

// These are the conditions an UPDATE repeats so that a check and its write
// can't be split by a sign-in or a role change; read as SQL, without D1.
const db = drizzle({} as never);
const where = (guard: ReturnType<typeof editable>) =>
	db.update(user).set({ city: "x" }).where(guard).toSQL();

describe("editable", () => {
	it("lets an admin or the person themselves write by id alone", () => {
		const q = where(editable("u1", null, true));
		expect(q.sql).toMatch(/where "user"\."id" = \?$/);
		expect(q.params.at(-1)).toBe("u1");
	});

	it("holds a host to an unclaimed, active, plain guest outside any family", () => {
		const q = where(editable("u1", "h1", false));
		expect(q.sql).toContain('"claimed_at" is null');
		expect(q.sql).toContain(`"status" = ?`);
		expect(q.sql).toContain('"role" is null');
		expect(q.sql).toContain("not exists (select 1 from family_member");
		expect(q.sql).not.toContain('"created_by"');
		expect(q.params).toContain("active");
	});

	it("also needs the host to have typed them in for an address or number", () => {
		const q = where(editable("u1", "h1", true));
		expect(q.sql).toContain(`"created_by" = ?`);
		expect(q.params.at(-1)).toBe("h1");
	});
});

describe("fillable", () => {
	it("fills a guest's own record unless they are deactivated", () => {
		const q = where(fillable("u1", "self"));
		expect(q.sql).toContain(`"status" <> ?`);
		expect(q.sql).not.toContain('"claimed_at"');
	});

	it("fills from a card only what its host could", () => {
		const q = where(fillable("u1", { card: "h1" }));
		expect(q.sql).toContain('"claimed_at" is null');
		expect(q.sql).toContain(`"created_by" = ?`);
		expect(q.params).toContain("h1");
	});

	it("fills nothing from a card whose host is gone", () => {
		expect(where(fillable("u1", { card: null })).sql).toMatch(/where 0$/);
	});
});

describe("dietWritable", () => {
	it("lets a relative write only within a shared family", () => {
		const q = where(dietWritable("kid", { admin: false, userId: "mum" }));
		expect(q.sql).toContain("join family_member kin");
		expect(q.params).toEqual(expect.arrayContaining(["mum", "kid"]));
	});

	it("lets a person set their own unless deactivated, and an admin anyone", () => {
		const own = where(dietWritable("u1", { admin: false, userId: "u1" }));
		expect(own.sql).toContain(`"status" <> ?`);
		expect(own.sql).not.toContain("family_member");
		const admin = where(dietWritable("u1", { admin: true }));
		expect(admin.sql).toMatch(/where "user"\."id" = \?$/);
	});
});
