const BASE = 'https://api.ourcityvibe.com';

/**
 * Build a share URL for an event. Callers prefer the human-readable slug
 * (`/event/lagos-beach-party`), then the shareToken, then the event _id —
 * the server resolves all three, so older events and already-shared links
 * still work.
 */
export function createEventShareLink(slugOrTokenOrId: string): string {
  return `${BASE}/event/${slugOrTokenOrId}`;
}

/**
 * Build a share URL for a guide. Callers prefer the slug and fall back to
 * the guide _id; the server resolves both.
 */
export function createGuideShareLink(slugOrId: string): string {
  return `${BASE}/guide/${slugOrId}`;
}

/**
 * Build a share URL for a user's public profile. Opens the app straight onto
 * that profile via the `/user/<slug-or-id>` universal link. Callers prefer
 * the username slug and fall back to the user _id.
 */
export function createUserShareLink(slugOrId: string): string {
  return `${BASE}/user/${slugOrId}`;
}
