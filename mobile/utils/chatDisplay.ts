import type { Chat, User } from "@/services/chat.service";
import { displayName } from "@/utils/displayName";

/**
 * Per-chat identity for a participant, so each conversation reads like the
 * account it belongs to: in a vendor-context chat the business side shows its
 * business name and picture; in a personal chat both sides show their
 * personal identity, even if one of them happens to run a storefront.
 */

export function isBusinessSide(chat: Chat, userId?: string | null): boolean {
  return (
    chat.context === "vendor" &&
    !!userId &&
    String(chat.vendorParticipant) === String(userId)
  );
}

export function chatParticipantName(chat: Chat, user?: User | null): string {
  if (!user) return "";
  if (isBusinessSide(chat, user._id)) return displayName(user);
  return user.username || "";
}

export function chatParticipantAvatar(
  chat: Chat,
  user?: User | null
): string | undefined {
  if (!user) return undefined;
  if (isBusinessSide(chat, user._id) && user.businessPicture) {
    return user.businessPicture;
  }
  return user.profilePicture;
}
