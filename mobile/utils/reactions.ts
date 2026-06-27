import type { MessageReaction } from "@/services/chat.service";

export interface GroupedReaction {
  emoji: string;
  count: number;
  /** True when the current user is one of the reactors for this emoji. */
  mine: boolean;
  users: { _id: string; username?: string; profilePicture?: string }[];
}

/** The reactor's user id, whether the reaction stores a bare id or a populated user. */
export function reactionUserId(r: MessageReaction): string {
  return typeof r.user === "string" ? r.user : r.user?._id;
}

/**
 * Group a message's reactions by emoji, keeping the list of who reacted so the
 * "reacted by" sheet can be rendered. Shared by the in-bubble reaction chip and
 * the screen-level reactions sheet so the two never drift.
 */
export function groupReactions(
  reactions: MessageReaction[] | undefined,
  currentUserId?: string
): GroupedReaction[] {
  const map: Record<string, GroupedReaction> = {};
  for (const r of reactions || []) {
    const uid = reactionUserId(r);
    const u = typeof r.user === "string" ? { _id: r.user } : r.user;
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, mine: false, users: [] };
    map[r.emoji].count += 1;
    map[r.emoji].users.push(u);
    if (uid && uid === currentUserId) map[r.emoji].mine = true;
  }
  return Object.values(map);
}
