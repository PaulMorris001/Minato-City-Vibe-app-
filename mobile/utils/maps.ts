import { Alert, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

import { showSuccess } from "@/utils/toast";

/**
 * Handing a venue off to whichever map app the user prefers.
 *
 * The two platforms need opposite approaches. Android has a system-wide `geo:`
 * intent, so firing it produces Android's own "open with" chooser listing every
 * installed map app — better than anything we could build. iOS has no such
 * chooser, so we probe for the apps we can name and present the choice
 * ourselves; when only Apple Maps is there we skip the prompt and just open it.
 */

export interface MapDestination {
  latitude?: number | null;
  longitude?: number | null;
  /** Venue/address text — the search fallback when there are no coordinates. */
  label: string;
}

/** True when both coordinates are real numbers we can drop a pin on. */
export function hasCoordinates(
  dest: Pick<MapDestination, "latitude" | "longitude">
): dest is { latitude: number; longitude: number } {
  return (
    typeof dest.latitude === "number" &&
    typeof dest.longitude === "number" &&
    Number.isFinite(dest.latitude) &&
    Number.isFinite(dest.longitude)
  );
}

type Target = { name: string; url: string };

function buildTargets(dest: MapDestination): Target[] {
  const q = encodeURIComponent(dest.label);
  if (!hasCoordinates(dest)) {
    // No pin — every app can still run a text search for the address.
    return [
      { name: "Apple Maps", url: `maps://?q=${q}` },
      { name: "Google Maps", url: `comgooglemaps://?q=${q}` },
    ];
  }
  const { latitude: lat, longitude: lng } = dest;
  return [
    { name: "Apple Maps", url: `maps://?ll=${lat},${lng}&q=${q}` },
    { name: "Google Maps", url: `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}` },
    { name: "Waze", url: `waze://?ll=${lat},${lng}&navigate=yes` },
  ];
}

/** Browser fallback when no map app can be opened. */
function webUrl(dest: MapDestination): string {
  const query = hasCoordinates(dest)
    ? `${dest.latitude},${dest.longitude}`
    : dest.label;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function openWeb(dest: MapDestination) {
  try {
    await Linking.openURL(webUrl(dest));
  } catch {
    Alert.alert("Maps unavailable", "No map app could open this location.");
  }
}

export async function openInMapsApp(dest: MapDestination): Promise<void> {
  if (Platform.OS === "android") {
    // `geo:` is handled by every Android map app, so the OS shows its own
    // chooser. The `q=` duplicate is what makes the pin carry a label — a bare
    // `geo:lat,lng` drops an unnamed marker.
    const uri = hasCoordinates(dest)
      ? `geo:${dest.latitude},${dest.longitude}?q=${dest.latitude},${dest.longitude}(${encodeURIComponent(dest.label)})`
      : `geo:0,0?q=${encodeURIComponent(dest.label)}`;
    try {
      await Linking.openURL(uri);
    } catch {
      await openWeb(dest);
    }
    return;
  }

  // iOS: probe the apps we know how to address. `canOpenURL` needs each scheme
  // listed in LSApplicationQueriesSchemes (see app.config.js) or it silently
  // answers false for installed apps.
  const targets = buildTargets(dest);
  const available: Target[] = [];
  for (const target of targets) {
    try {
      if (await Linking.canOpenURL(target.url)) available.push(target);
    } catch {
      // Unqueryable scheme — treat as not installed.
    }
  }

  if (available.length === 0) {
    await openWeb(dest);
    return;
  }
  if (available.length === 1) {
    // No choice to offer — don't make them tap through a one-item menu.
    await Linking.openURL(available[0].url).catch(() => openWeb(dest));
    return;
  }

  Alert.alert(dest.label, "Open this location in…", [
    ...available.map((target) => ({
      text: target.name,
      onPress: () => {
        Linking.openURL(target.url).catch(() => openWeb(dest));
      },
    })),
    {
      text: "Copy address",
      onPress: () => {
        Clipboard.setStringAsync(dest.label)
          .then(() => showSuccess("Address copied to clipboard."))
          .catch(() => {});
      },
    },
    { text: "Cancel", style: "cancel" as const },
  ]);
}
