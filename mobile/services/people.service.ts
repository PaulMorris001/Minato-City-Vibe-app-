import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

/** One suggested person on the Discover People screen / profile preview. */
export interface SuggestedPerson {
  _id: string;
  username: string;
  slug?: string;
  profilePicture?: string;
  businessName?: string;
  isVendor?: boolean;
  verified?: boolean;
  /** Up to 3 guide topics, most-engaged first — rendered as the emoji tagline. */
  tagline: string[];
  mutualCount: number;
  isFollowing: boolean;
  isMutual: boolean;
  /** Why this person is being suggested, e.g. "You're both going to X". */
  reason: string;
}

export interface SuggestionRail {
  key: string;
  title: string;
  people: SuggestedPerson[];
}

/**
 * Grouped "people to add" rails for the current user. `city` overrides the
 * server's stored browsing city (the Discover screen passes the active one).
 */
export async function fetchPeopleSuggestions(city?: string): Promise<SuggestionRail[]> {
  const token = await SecureStore.getItemAsync("token");
  const res = await axios.get(`${BASE_URL}/people/suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
    params: city ? { city } : undefined,
  });
  return res.data.rails || [];
}
