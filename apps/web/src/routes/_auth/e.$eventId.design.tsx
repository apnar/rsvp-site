import { allFaces, type Faces, loadFaces } from "@rsvp-site/design/faces";
import { SAMPLE_VALUES, type Values } from "@rsvp-site/design/placeholders";
import { layoutCard, type TextCache } from "@rsvp-site/design/scene";
import { type Design, parseDesign } from "@rsvp-site/design/schema";
import type { Placed } from "@rsvp-site/design/templates/index";
import { warningsOf } from "@rsvp-site/design/warnings";
import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Redo2, Undo2 } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Switch } from "@/components/controls";
import { AddMenu } from "@/components/design/add-menu";
import { DesignCanvas } from "@/components/design/canvas";
import { DesignerContext } from "@/components/design/designer-context";
import { addEl, initialState, reducer } from "@/components/design/editor-state";
import { Inspector } from "@/components/design/inspector";
import { Layers } from "@/components/design/layers";
import { PickTemplate } from "@/components/design/pick-template";
import { TopBar } from "@/components/design/top-bar";
import { UnsavedBar } from "@/components/design/unsaved-bar";
import { useDesignSave } from "@/components/design/use-design-save";
import { useImageTray } from "@/components/design/use-image-tray";
import { useKeys } from "@/components/design/use-keys";
import { pageTitle } from "@/content/site";
import { fontFaceCss } from "@/lib/design-font-css";
import { messageOf } from "@/lib/errors";
import { orNotFound } from "@/lib/not-found";
import { layoutsFor } from "@/lib/paper-sizes";
import { orpc } from "@/utils/orpc";

/**
 * The designer. Rendered in the browser only: it measures the screen,
 * captures the pointer and loads every font's metrics, none of which the
 * server can do, and nobody links to it from outside.
 */
export const Route = createFileRoute("/_auth/e/$eventId/design")({
	ssr: false,
	staticData: { ownHeader: true },
	// Never show a remembered load while a fresh one runs: the designer
	// decides from it whether there is a design to open or a template to
	// pick, and an earlier visit's "nothing saved yet" would send a host
	// who has since saved straight back to the templates.
	gcTime: 0,
	loader: async ({ context, params }) => {
		const input = { input: { eventId: params.eventId } };
		const [design, event, faces] = await orNotFound(
			Promise.all([
				context.queryClient.fetchQuery({
					...orpc.designs.get.queryOptions(input),
					staleTime: 0,
				}),
				context.queryClient.ensureQueryData(
					orpc.events.get.queryOptions(input),
				),
				loadFaces(allFaces()),
			]),
		);
		return { design, event, faces };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(
					loaderData ? `Design · ${loaderData.event.event.title}` : null,
				),
			},
		],
	}),
	component: Designer,
});

const FONT_CSS = fontFaceCss(allFaces());

/** The event's facts, with stand-ins where it has none yet. */
function valuesOf(
	event: {
		title: string;
		location: string;
		hostLine: string;
		details: string;
	},
	labels: {
		dateLabel: string | null;
		timeLabel: string | null;
		deadlineLabel: string | null;
	},
): Values {
	return {
		title: event.title || SAMPLE_VALUES.title,
		date: labels.dateLabel ?? SAMPLE_VALUES.date,
		time: labels.timeLabel ?? SAMPLE_VALUES.time,
		location: event.location || SAMPLE_VALUES.location,
		host: event.hostLine || SAMPLE_VALUES.host,
		rsvpBy: labels.deadlineLabel ?? SAMPLE_VALUES.rsvpBy,
		details: event.details || SAMPLE_VALUES.details,
		guest: SAMPLE_VALUES.guest,
	};
}

const RAW_VALUES: Values = {
	title: "{title}",
	date: "{date}",
	time: "{time}",
	location: "{location}",
	host: "{host}",
	rsvpBy: "{rsvp by}",
	details: "{details}",
	guest: "{guest}",
};

function Designer() {
	const { eventId } = Route.useParams();
	const { faces } = Route.useLoaderData();
	const { data: saved } = useSuspenseQuery(
		orpc.designs.get.queryOptions({ input: { eventId } }),
	);
	const { data: loaded } = useSuspenseQuery(
		orpc.events.get.queryOptions({ input: { eventId } }),
	);
	const e = loaded.event;
	const values = useMemo(() => valuesOf(e, loaded.labels), [e, loaded.labels]);
	const start = useMemo(() => {
		const parsed = saved.doc ? parseDesign(saved.doc) : null;
		return parsed?.ok ? parsed.design : null;
	}, [saved.doc]);
	const [picking, setPicking] = useState(start === null);
	const [first, setFirst] = useState<Design | null>(start);
	// A new editor only when a template is picked; a refetch of the saved
	// design must never reset work in progress.
	const [epoch, setEpoch] = useState(0);
	const copied = useRef(new Map<string, Placed>());
	// The newest version this visit has saved. An editor made by "Start
	// over" must carry on from it, or its first save looks like it is
	// overwriting somebody else's.
	const savedHere = useRef(0);
	// A saved design that arrives after the page did (a refetch) opens, as
	// long as nothing has been picked yet.
	useEffect(() => {
		if (start && !first) {
			setFirst(start);
			setPicking(false);
		}
	}, [start, first]);

	return (
		<div className="flex flex-col">
			<style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
			{picking || !first ? (
				<PickTemplate
					eventId={eventId}
					title={e.title}
					coverKey={e.coverKey}
					paper={e.paper}
					faces={faces}
					values={values}
					copied={copied.current}
					canCancel={first !== null}
					onCancel={() => setPicking(false)}
					onPick={(d) => {
						setFirst(d);
						setEpoch((n) => n + 1);
						setPicking(false);
					}}
				/>
			) : (
				<Editor
					key={epoch}
					eventId={eventId}
					title={e.title}
					paper={e.paper}
					shareLink={e.shareEnabled}
					faces={faces}
					values={values}
					initial={first}
					version={Math.max(saved.version, savedHere.current)}
					designOn={saved.version === 0 ? true : saved.designOn}
					images={saved.images}
					unsaved={first !== start}
					onStartOver={() => setPicking(true)}
					onSaved={(v) => {
						savedHere.current = Math.max(savedHere.current, v);
					}}
				/>
			)}
		</div>
	);
}

function Editor({
	eventId,
	title,
	paper,
	shareLink,
	faces,
	values,
	initial,
	version,
	designOn: startOn,
	images: startImages,
	unsaved,
	onStartOver,
	onSaved,
}: {
	eventId: string;
	title: string;
	paper: boolean;
	shareLink: boolean;
	faces: Faces;
	values: Values;
	initial: Design;
	version: number;
	designOn: boolean;
	images: string[];
	unsaved: boolean;
	onStartOver: () => void;
	onSaved: (version: number) => void;
}) {
	const [state, dispatch] = useReducer(reducer, initial, initialState);
	const { doc, selected } = state;
	const [raw, setRaw] = useState(false);
	const textRef = useRef<HTMLTextAreaElement>(null);
	const tray = useImageTray(eventId, initial, startImages);
	useKeys(state, dispatch);

	const warn = useCallback(
		(d: Design) => warningsOf(d, { paper, shareLink, faces, values }),
		[paper, shareLink, faces, values],
	);
	const {
		designOn,
		setDesignOn,
		dirty,
		saving,
		blocker,
		saveFromButton,
		saveAndLeave,
	} = useDesignSave({
		eventId,
		doc,
		initial,
		version,
		designOn: startOn,
		unsaved,
		blockingMessage: (d) => warn(d).find((w) => w.level === "block")?.message,
		onSaved,
	});

	const set = useCallback(
		(d: Design, key?: string) =>
			dispatch({ t: "set", doc: d, key, at: Date.now() }),
		[],
	);
	// Handlers the side panels hold on to read the newest state from here, so
	// they stay the same function while the document changes under a drag.
	const latest = useRef(state);
	latest.current = state;
	const select = useCallback((ids: string[], add: boolean) => {
		dispatch({
			t: "select",
			ids: add ? [...new Set([...latest.current.selected, ...ids])] : ids,
		});
	}, []);
	const add = useCallback(
		(el: Design["elements"][number]) => {
			set(addEl(latest.current.doc, el));
			dispatch({ t: "select", ids: [el.id] });
		},
		[set],
	);
	const context = useMemo(() => ({ set, paper, tray }), [set, paper, tray]);

	// A drag moves one box: every other text keeps its line breaks.
	const textCache = useRef<TextCache>(new Map());
	const shown = raw ? RAW_VALUES : values;
	const scene = useMemo(
		() =>
			layoutCard(doc, {
				values: shown,
				mode: paper ? "paper" : "web",
				faces,
				bleed: paper && doc.bleed,
				textCache: textCache.current,
			}),
		[doc, shown, paper, faces],
	);
	// The warnings trail a drag by a frame: they are heavy and nobody reads
	// them mid-gesture. The side panels must not: they build their edits
	// from the document they were given, and a stale one would undo the
	// drag that just finished.
	const lagging = useDeferredValue(doc);
	const warnings = useMemo(() => warn(lagging), [warn, lagging]);

	const previewPdf = async () => {
		// Only ever called from a click, as on the guest list: saying so drops
		// the PDF library from the Worker, which would carry it for nothing.
		if (import.meta.env.SSR) return;
		try {
			const { buildDesignInvites } = await import("@/lib/design-pdf");
			const layout = layoutsFor(doc.format)[0]?.value ?? "exact";
			const pdf = await buildDesignInvites({
				design: doc,
				values,
				guests: [
					{
						id: "sample",
						name: values.guest,
						url: `${window.location.origin}/api/auth/paper?k=sample`,
					},
				],
				layout,
				title,
			});
			const url = URL.createObjectURL(
				new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
			);
			window.open(url, "_blank", "noopener");
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (error) {
			toast.error(messageOf(error) || "The PDF didn't build.");
		}
	};

	const landscape = scene.w > scene.h;

	return (
		<DesignerContext.Provider value={context}>
			<TopBar eventId={eventId} title={title}>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Undo"
					disabled={state.past.length === 0}
					onClick={() => dispatch({ t: "undo" })}
				>
					<Undo2 />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Redo"
					disabled={state.future.length === 0}
					onClick={() => dispatch({ t: "redo" })}
				>
					<Redo2 />
				</Button>
				<span className="flex items-center gap-2 px-1 text-[13px] text-soft">
					<Switch
						checked={designOn}
						onChange={setDesignOn}
						label="Guests see this design"
					/>
					<span className="max-sm:hidden" aria-hidden>
						Guests see it
					</span>
				</span>
				{paper ? (
					<Button variant="outline" size="sm" onClick={previewPdf}>
						Preview PDF
					</Button>
				) : null}
				<Button size="sm" disabled={saving || !dirty} onClick={saveFromButton}>
					{saving ? "Saving…" : dirty ? "Save" : "Saved"}
				</Button>
			</TopBar>
			<UnsavedBar
				blocker={blocker}
				saving={saving}
				onSaveAndLeave={saveAndLeave}
			/>
			<div className="grid gap-5 px-[clamp(12px,3vw,24px)] py-5 lg:grid-cols-[250px_minmax(0,1fr)_330px]">
				<aside className="order-3 flex flex-col gap-5 lg:order-1">
					<section className="flex flex-col gap-2.5">
						<h2 className="kicker m-0 text-haze">Add</h2>
						<AddMenu doc={doc} onAdd={add} />
					</section>
					<section className="flex flex-col gap-2.5">
						<h2 className="kicker m-0 text-haze">Layers</h2>
						<Layers doc={doc} selected={selected} onSelect={select} />
					</section>
					<Button
						variant="ghost"
						size="sm"
						className="self-start"
						onClick={onStartOver}
					>
						Start over from a template
					</Button>
				</aside>
				<main className="order-1 flex min-w-0 flex-col items-center gap-3 lg:order-2">
					<DesignCanvas
						doc={doc}
						scene={scene}
						selected={selected}
						dispatch={dispatch}
						showBleed={paper && doc.bleed}
						onEditText={() =>
							requestAnimationFrame(() => textRef.current?.focus())
						}
						className={cn(
							"w-full p-4",
							landscape ? "max-w-[880px]" : "max-w-[600px]",
						)}
					/>
					<label className="flex items-center gap-2 text-[13px] text-haze">
						<input
							type="checkbox"
							className="size-4 accent-lime"
							checked={raw}
							onChange={(ev) => setRaw(ev.target.checked)}
						/>
						Show the {"{placeholders}"} instead of your event's details
					</label>
				</main>
				<aside className="order-2 flex flex-col gap-4 lg:order-3">
					{warnings.length > 0 ? (
						<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
							{warnings.map((w, i) => (
								<li
									key={i}
									className={cn(
										"rounded-[12px] border px-3 py-2 text-[13px]",
										w.level === "block"
											? "border-pink bg-pink/14"
											: "border-line-strong bg-panel",
									)}
								>
									{w.id ? (
										<button
											type="button"
											className="cursor-pointer border-0 bg-transparent p-0 text-left text-ink"
											onClick={() =>
												dispatch({ t: "select", ids: [w.id ?? ""] })
											}
										>
											{w.message}
										</button>
									) : (
										w.message
									)}
								</li>
							))}
						</ul>
					) : null}
					<div className="rounded-[20px] bg-panel p-4">
						<Inspector doc={doc} selected={selected} textRef={textRef} />
					</div>
				</aside>
			</div>
		</DesignerContext.Provider>
	);
}
