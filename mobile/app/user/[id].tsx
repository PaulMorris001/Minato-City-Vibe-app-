import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Landing route for shared profile links (`https://api.ourcityvibe.com/user/<id>`
 * and `mobile://user/<id>`). expo-router auto-routes the universal/app link
 * here; we just bounce to the real profile screen, which is keyed off the
 * `userId` query param. Mirrors how `/event/[id]` redirects into `/share`.
 */
export default function UserDeepLink() {
  const rawParams = useLocalSearchParams();
  const id =
    typeof rawParams.id === "string"
      ? rawParams.id
      : Array.isArray(rawParams.id)
        ? rawParams.id[0]
        : undefined;

  if (!id) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={`/user-profile?userId=${encodeURIComponent(id)}`} />;
}
