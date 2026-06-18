/**
 * Splits a chat message's plain text into renderable segments so the bubble can
 * make URLs tappable and highlight @mentions, while leaving normal text alone.
 *
 * Kept deliberately dependency-free (one regex pass) — it runs for every text
 * message on every render.
 */

export type MessageSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; url: string }
  | { kind: "mention"; value: string; username: string };

// http(s):// links, bare www. links, or @username mentions. Scanned left→right.
const TOKEN_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)|(@\w+)/gi;
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

export function hasLink(text: string): boolean {
  return URL_RE.test(text);
}

export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text) return [];
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    const [full, urlTok, mentionTok] = match;

    if (urlTok) {
      // Trailing punctuation (a period ending a sentence, a closing paren) is
      // almost never part of the URL — strip it back into a text segment.
      const trimmed = urlTok.replace(/[.,!?;:)\]]+$/, "");
      const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
      segments.push({ kind: "link", value: trimmed, url });
      const trailing = urlTok.slice(trimmed.length);
      if (trailing) segments.push({ kind: "text", value: trailing });
    } else if (mentionTok) {
      segments.push({
        kind: "mention",
        value: mentionTok,
        username: mentionTok.slice(1),
      });
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
