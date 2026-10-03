import type { Outputs } from "@/lib/api-types";

type GuestList = Outputs["guests"]["list"];

export type Guest = GuestList["guests"][number];

/** The event as the host's guest list sees it. */
export type ListEvent = GuestList["event"];
