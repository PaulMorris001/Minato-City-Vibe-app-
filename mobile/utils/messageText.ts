/**
 * Splits a chat message's plain text into renderable segments so the bubble can
 * make URLs tappable and highlight @mentions, while leaving normal text alone.
 *
 * Mentions are matched against the chat's KNOWN usernames (passed in) so that
 * usernames containing spaces or symbols (e.g. "@setemi Loye") are tagged in
 * full. We try the longest usernames first so "@setemi Loye" wins over a bare
 * "@setemi". When no username list is available we fall back to a simple
 * `@word` match.
 */

export type MessageSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; url: string }
  | { kind: "mention"; value: string; username: string };

const URL_AT_START = /^(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

export function hasLink(text: string): boolean {
  return URL_RE.test(text);
}

export function parseMessageSegments(
  text: string,
  usernames: string[] = []
): MessageSegment[] {
  if (!text) return [];

  // Longest usernames first so a multi-word name matches before its first word.
  const known = [...new Set(usernames.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );

  const segments: MessageSegment[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      segments.push({ kind: "text", value: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // URL (no spaces, so a simple anchored match is safe).
    const urlMatch = URL_AT_START.exec(rest);
    if (urlMatch) {
      const raw = urlMatch[1];
      const trimmed = raw.replace(/[.,!?;:)\]]+$/, "");
      const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
      flush();
      segments.push({ kind: "link", value: trimmed, url });
      i += trimmed.length;
      continue;
    }

    // Mention: '@' at a word boundary (start of string or after whitespace).
    if (text[i] === "@" && (i === 0 || /\s/.test(text[i - 1]))) {
      const after = text.slice(i + 1);
      const afterLower = after.toLowerCase();
      let matched: string | null = null;

      for (const name of known) {
        if (afterLower.startsWith(name.toLowerCase())) {
          matched = after.slice(0, name.length); // preserve original casing
          break;
        }
      }
      if (!matched) {
        const m = /^[A-Za-z0-9_]+/.exec(after);
        if (m) matched = m[0];
      }

      if (matched) {
        flush();
        segments.push({ kind: "mention", value: "@" + matched, username: matched });
        i += 1 + matched.length;
        continue;
      }
    }

    buf += text[i];
    i += 1;
  }

  flush();
  return segments;
}
