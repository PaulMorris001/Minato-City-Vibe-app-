import React, { createContext, useCallback, useContext, useState } from "react";

import type { LocationSelection } from "@/libs/interfaces";
import type { PinnedCoordinates } from "@/components/shared/LocationPinPicker";
import type { LocationDraft } from "@/components/shared/AdditionalLocationsEditor";
import type { SubEventDraft } from "@/components/shared/SubEventsEditor";
import type { TierDraft } from "@/components/shared/TicketTiersEditor";

/**
 * The event-creation draft, shared across the `app/create-event/` screen
 * group. What used to be CreateEventModal's one `formData` object plus its six
 * sibling `useState`s, flattened into a single record with one setter — the
 * same shape, moved up a level now that real navigation sits between the
 * pieces (basics, tiers, other locations, sub-events, venue proof).
 */
export interface CreateEventDraft {
  isBirthdayRaffle: boolean;

  // Loaded once on entry; display-only, the server independently derives and
  // enforces the real values.
  isVerified: boolean;
  sellerCurrency: string;
  sellerCountry: string | undefined;

  title: string;
  date: string;
  // Optional. Empty means the event is a single date.
  endDate: string;
  description: string;
  isVirtual: boolean;
  meetingLink: string;
  isPublic: boolean;
  showAttendance: boolean;
  isPaid: boolean;
  hidePrice: boolean;
  // Used only while `tiers` is empty.
  ticketPrice: string;
  maxGuests: string;

  eventLocation: LocationSelection | null;
  address: string;
  // Exact venue pin. Optional — an event without one still works.
  pinnedCoords: PinnedCoordinates | null;
  eventImages: string[];
  venueProofImage: string;

  // Further venues the event runs at in parallel. Mutually exclusive with
  // subEvents below — the server rejects an event claiming both.
  extraVenues: LocationDraft[];
  // A programme of sub-events — different things under one invitation.
  subEvents: SubEventDraft[];
  // Named ticket tiers. While empty, the flat ticketPrice above is used.
  tiers: TierDraft[];
}

function emptyDraft(): CreateEventDraft {
  return {
    isBirthdayRaffle: false,
    isVerified: false,
    sellerCurrency: "USD",
    sellerCountry: undefined,
    title: "",
    date: "",
    endDate: "",
    description: "",
    isVirtual: false,
    meetingLink: "",
    isPublic: false,
    showAttendance: false,
    isPaid: false,
    hidePrice: false,
    ticketPrice: "",
    maxGuests: "",
    eventLocation: null,
    address: "",
    pinnedCoords: null,
    eventImages: [],
    venueProofImage: "",
    extraVenues: [],
    subEvents: [],
    tiers: [],
  };
}

interface CreateEventContextValue {
  draft: CreateEventDraft;
  update: <K extends keyof CreateEventDraft>(key: K, value: CreateEventDraft[K]) => void;
  reset: () => void;
}

const CreateEventContext = createContext<CreateEventContextValue | null>(null);

/**
 * Holds the draft for exactly one pass through `app/create-event/`. Registered
 * only in that group's own `_layout.tsx` — never the root layout — so entering
 * the flow mounts a fresh draft and leaving it (success or back-out) discards
 * it, the same lifetime the modal's local `useState` used to have.
 */
export function CreateEventProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<CreateEventDraft>(emptyDraft);

  const update = useCallback(
    <K extends keyof CreateEventDraft>(key: K, value: CreateEventDraft[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    []
  );
  const reset = useCallback(() => setDraft(emptyDraft()), []);

  return (
    <CreateEventContext.Provider value={{ draft, update, reset }}>
      {children}
    </CreateEventContext.Provider>
  );
}

export function useCreateEvent() {
  const ctx = useContext(CreateEventContext);
  if (!ctx) {
    throw new Error("useCreateEvent must be used within the create-event screen group");
  }
  return ctx;
}
