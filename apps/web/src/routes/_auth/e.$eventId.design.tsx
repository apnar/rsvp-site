import { allFaces, type Faces, loadFaces } from "@rsvp-site/design/faces";
import { SAMPLE_VALUES, type Values } from "@rsvp-site/design/placeholders";
import { layoutCard } from "@rsvp-site/design/scene";
import { type Design, parseDesign } from "@rsvp-site/design/schema";
import type { TemplateContext } from "@rsvp-site/design/templates/index";
import { warningsOf } from "@rsvp-site/design/warnings";
import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import {
	type Dispatch,
	useCallback,
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
import {
	addEl,
	duplicateEls,
	type EditorAction,
	type EditorState,
	initialState,
	newId,
	reducer,
	removeEls,
	restack,
	updateEls,
} from "@/components/design/editor-state";
import {
	CardPanel,
	ElementPanel,
	type ImageTray,
	MultiPanel,
} from "@/components/design/inspector";
import { Layers } from "@/components/design/layers";
import { TemplatePicker } from "@/components/design/template-picker";
import { refreshCard } from "@/lib/design-card";
import { fontFaceCss } from "@/lib/design-font-css";
import { designSrc } from "@/lib/format";
import { layoutsFor } from "@/lib/paper-sizes";
import { naturalSize, shrinkForDesign } from "@/lib/shrink-image";
import { client, orpc } from "@/utils/orpc";

/**
 * The designer. Rendered in the browser only: it measures the screen,
 * captures the pointer and loads every font's metrics, none of which the
 * server can do, and nobody links to it from outside.
 */
export const Route = createFileRoute("/_auth/e/$eventId/design")({
	ssr: false,
	loader: async ({ context, params }) => {
		const input = { input: { eventId: params.eventId } };
		const [design, event, faces] = await Promise.all([
			context.queryClient.fetchQuery({
				...orpc.designs.get.queryOptions(input),
				staleTime: 0,
			}),
			context.queryClient.ensureQueryData(orpc.events.get.queryOptions(input)),
			loadFaces(allFaces()),
		]);
		return { design, event, faces };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `Design · ${loaderData.event.event.title} · Botch RSVP`
					: "Botch RSVP",
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
					version={saved.version}
					designOn={saved.version === 0 ? true : saved.designOn}
					images={saved.images}
					unsaved={first !== start}
					onStartOver={() => setPicking(true)}
				/>
			)}
		</div>
	);
}

function TopBar({
	eventId,
	title,
	children,
}: {
	eventId: string;
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-line border-b bg-night/95 px-[clamp(12px,3vw,24px)] py-2.5 backdrop-blur">
			<Link
				to="/e/$eventId/edit"
				params={{ eventId }}
				className="flex items-center gap-1.5 font-bold text-[14px] no-underline"
			>
				<ArrowLeft className="size-4" /> Event
			</Link>
			<span className="mr-auto min-w-0 truncate pl-2 font-heading text-[15px]">
				{title}
			</span>
			{children}
		</header>
	);
}

function PickTemplate({
	eventId,
	title,
	coverKey,
	paper,
	faces,
	values,
	canCancel,
	onCancel,
	onPick,
}: {
	eventId: string;
	title: string;
	coverKey: string | null;
	paper: boolean;
	faces: Faces;
	values: Values;
	canCancel: boolean;
	onCancel: () => void;
	onPick: (d: Design) => void;
}) {
	const [ctx, setCtx] = useState<TemplateContext | null>(
		coverKey ? null : { cover: null, paper },
	);
	useEffect(() => {
		if (!coverKey) return;
		let live = true;
		// The cover is copied into the design's own images, so templates can
		// show it and replacing the cover later can't pull it out of the card.
		client.designs
			.copyCover({ eventId })
			.then(async ({ ref }) => {
				if (!ref) return null;
				const { width, height } = await naturalSize(designSrc(ref));
				return { ref, iw: width, ih: height };
			})
			.catch(() => null)
			.then((cover) => {
				if (live) setCtx({ cover, paper });
			});
		return () => {
			live = false;
		};
	}, [coverKey, eventId, paper]);
	return (
		<>
			<TopBar eventId={eventId} title={title}>
				{canCancel ? (
					<Button variant="ghost" size="sm" onClick={onCancel}>
						Back to my design
					</Button>
				) : null}
			</TopBar>
			<div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-[clamp(16px,4vw,40px)] py-8">
				<div>
					<h1 className="m-0 text-[clamp(26px,4vw,40px)]">
						Pick a starting point
					</h1>
					<p className="m-0 mt-1 text-soft">
						Everything on it can be changed. The words in braces fill in from
						your event.
					</p>
				</div>
				{ctx ? (
					<TemplatePicker
						ctx={ctx}
						faces={faces}
						values={values}
						onPick={onPick}
					/>
				) : (
					<p className="text-haze">Fetching your cover photo…</p>
				)}
			</div>
		</>
	);
}

function isTyping(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	if (
		el.isContentEditable ||
		el.tagName === "TEXTAREA" ||
		el.tagName === "SELECT"
	) {
		return true;
	}
	// A focused slider, checkbox or swatch shouldn't swallow the shortcuts.
	return (
		el.tagName === "INPUT" &&
		!["range", "checkbox", "color", "button", "file"].includes(
			(el as HTMLInputElement).type,
		)
	);
}

function useKeys(state: EditorState, dispatch: Dispatch<EditorAction>) {
	const clip = useRef<Design["elements"]>([]);
	const latest = useRef(state);
	latest.current = state;
	useEffect(() => {
		const onKey = (ev: KeyboardEvent) => {
			if (isTyping(ev.target)) return;
			const { doc, selected } = latest.current;
			const mod = ev.metaKey || ev.ctrlKey;
			const set = (d: Design, key?: string) =>
				dispatch({ t: "set", doc: d, key });
			const movable = doc.elements
				.filter((x) => selected.includes(x.id) && !x.locked)
				.map((x) => x.id);
			if (mod && ev.key.toLowerCase() === "z") {
				dispatch({ t: ev.shiftKey ? "redo" : "undo" });
			} else if (mod && ev.key.toLowerCase() === "y") {
				dispatch({ t: "redo" });
			} else if (mod && ev.key.toLowerCase() === "d" && selected.length) {
				const r = duplicateEls(doc, selected);
				set(r.doc);
				dispatch({ t: "select", ids: r.ids });
			} else if (mod && ev.key.toLowerCase() === "c" && selected.length) {
				clip.current = doc.elements.filter((x) => selected.includes(x.id));
				return;
			} else if (mod && ev.key.toLowerCase() === "v" && clip.current.length) {
				let next = doc;
				const ids: string[] = [];
				for (const c of clip.current) {
					const id = newId(next);
					next = addEl(next, { ...c, id, x: c.x + 24, y: c.y + 24 });
					ids.push(id);
				}
				set(next);
				dispatch({ t: "select", ids });
			} else if (
				(ev.key === "Delete" || ev.key === "Backspace") &&
				movable.length
			) {
				set(removeEls(doc, movable));
			} else if (ev.key.startsWith("Arrow") && movable.length) {
				const step = ev.shiftKey ? 10 : 1;
				const dx =
					ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
				const dy =
					ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
				set(
					updateEls(doc, movable, (x) => ({ ...x, x: x.x + dx, y: x.y + dy })),
					"nudge",
				);
			} else if (
				(ev.key === "]" || ev.key === "[") &&
				selected.length === 1 &&
				selected[0]
			) {
				set(
					restack(
						doc,
						selected[0],
						ev.key === "]"
							? ev.shiftKey
								? "top"
								: "up"
							: ev.shiftKey
								? "bottom"
								: "down",
					),
				);
			} else if (ev.key === "Escape") {
				dispatch({ t: "select", ids: [] });
			} else {
				return;
			}
			ev.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [dispatch]);
}

function Editor({
	eventId,
	title,
	paper,
	shareLink,
	faces,
	values,
	initial,
	version: startVersion,
	designOn: startOn,
	images: startImages,
	unsaved,
	onStartOver,
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
}) {
	const queryClient = useQueryClient();
	const [state, dispatch] = useReducer(reducer, initial, initialState);
	const { doc, selected } = state;
	const [savedDoc, setSavedDoc] = useState<Design | null>(
		unsaved ? null : initial,
	);
	const [version, setVersion] = useState(startVersion);
	const [designOn, setDesignOn] = useState(startOn);
	const [savedOn, setSavedOn] = useState(unsaved ? !startOn : startOn);
	const [saving, setSaving] = useState(false);
	const [raw, setRaw] = useState(false);
	const [images, setImages] = useState(startImages);
	const [uploading, setUploading] = useState(false);
	const sizes = useRef(new Map<string, { iw: number; ih: number }>());
	const textRef = useRef<HTMLTextAreaElement>(null);
	useKeys(state, dispatch);

	const dirty = doc !== savedDoc || designOn !== savedOn;
	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		enableBeforeUnload: () => dirty,
		withResolver: true,
	});

	const set = useCallback(
		(d: Design, key?: string) => dispatch({ t: "set", doc: d, key }),
		[],
	);
	const select = (ids: string[], add: boolean) =>
		dispatch({
			t: "select",
			ids: add ? [...new Set([...selected, ...ids])] : ids,
		});

	const shown = raw ? RAW_VALUES : values;
	const scene = useMemo(
		() =>
			layoutCard(doc, {
				values: shown,
				mode: paper ? "paper" : "web",
				faces,
				bleed: paper && doc.bleed,
			}),
		[doc, shown, paper, faces],
	);
	const warnings = useMemo(
		() => warningsOf(doc, { paper, shareLink, faces, values }),
		[doc, paper, shareLink, faces, values],
	);
	const blocking = warnings.filter((w) => w.level === "block");

	const tray: ImageTray = {
		images,
		busy: uploading,
		sizeOf: async (ref) => {
			const known = sizes.current.get(ref);
			if (known) return known;
			const { width, height } = await naturalSize(designSrc(ref));
			const size = { iw: width, ih: height };
			sizes.current.set(ref, size);
			return size;
		},
		upload: async (file) => {
			setUploading(true);
			try {
				const shrunk = await shrinkForDesign(file);
				const { ref } = await client.designs.uploadImage({
					eventId,
					file: shrunk.file,
				});
				const size = { iw: shrunk.width, ih: shrunk.height };
				sizes.current.set(ref, size);
				setImages((list) => [ref, ...list]);
				return { ref, ...size };
			} catch (error) {
				toast.error((error as Error).message);
				return null;
			} finally {
				setUploading(false);
			}
		},
	};

	const save = async () => {
		const parsed = parseDesign(doc);
		if (!parsed.ok) {
			toast.error(parsed.message);
			return;
		}
		if (designOn && blocking[0]) {
			toast.error(blocking[0].message);
			return;
		}
		setSaving(true);
		try {
			const r = await client.designs.save({
				eventId,
				doc: parsed.design,
				version,
				designOn,
			});
			setVersion(r.version);
			setSavedDoc(doc);
			setSavedOn(designOn);
			// The picture emails and link previews show, from what was saved.
			refreshCard(eventId).catch(() =>
				toast.error(
					"The card picture for emails didn't update. Save again to retry.",
				),
			);
			toast.success(
				designOn
					? "Saved. Guests see this card."
					: "Saved. Guests still see the plain invitation.",
			);
			await queryClient.invalidateQueries({ queryKey: orpc.events.key() });
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const previewPdf = async () => {
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
			toast.error((error as Error).message || "The PDF didn't build.");
		}
	};

	const one =
		selected.length === 1
			? doc.elements.find((x) => x.id === selected[0])
			: undefined;
	const landscape = scene.w > scene.h;

	return (
		<>
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
				<Button size="sm" disabled={saving || !dirty} onClick={save}>
					{saving ? "Saving…" : dirty ? "Save" : "Saved"}
				</Button>
			</TopBar>
			{blocker.status === "blocked" ? (
				<div className="flex flex-wrap items-center gap-3 border-pink border-b bg-pink/14 px-4 py-2.5 text-[14px]">
					<span className="mr-auto">You have changes that aren't saved.</span>
					<Button size="sm" variant="ghost" onClick={blocker.proceed}>
						Leave without saving
					</Button>
					<Button size="sm" variant="light" onClick={blocker.reset}>
						Stay
					</Button>
				</div>
			) : null}
			<div className="grid gap-5 px-[clamp(12px,3vw,24px)] py-5 lg:grid-cols-[250px_minmax(0,1fr)_330px]">
				<aside className="order-3 flex flex-col gap-5 lg:order-1">
					<section className="flex flex-col gap-2.5">
						<h2 className="kicker m-0 text-haze">Add</h2>
						<AddMenu
							doc={doc}
							paper={paper}
							tray={tray}
							onAdd={(el) => {
								set(addEl(doc, el));
								dispatch({ t: "select", ids: [el.id] });
							}}
						/>
					</section>
					<section className="flex flex-col gap-2.5">
						<h2 className="kicker m-0 text-haze">Layers</h2>
						<Layers doc={doc} selected={selected} onSelect={select} set={set} />
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
						{one ? (
							<ElementPanel
								el={one}
								doc={doc}
								set={set}
								paper={paper}
								tray={tray}
								textRef={textRef}
							/>
						) : selected.length > 1 ? (
							<MultiPanel doc={doc} ids={selected} set={set} />
						) : (
							<CardPanel doc={doc} set={set} paper={paper} tray={tray} />
						)}
					</div>
				</aside>
			</div>
		</>
	);
}
