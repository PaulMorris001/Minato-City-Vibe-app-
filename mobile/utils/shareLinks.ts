const BASE = 'https://api.ourcityvibe.com';

/**
 * Build a share URL for an event. Prefer the shareToken; fall back to the
 * event _id so older events without a generated shareToken still resolve.
 */
export function createEventShareLink(shareTokenOrId: string): string {
  return `${BASE}/event/${shareTokenOrId}`;
}

export function createGuideShareLink(guideId: string): string {
  return `${BASE}/guide/${guideId}`;
}
