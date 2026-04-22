const BASE = 'https://night-vibe.onrender.com';

export function createEventShareLink(shareToken: string): string {
  return `${BASE}/event/${shareToken}`;
}

export function createGuideShareLink(guideId: string): string {
  return `${BASE}/guide/${guideId}`;
}
