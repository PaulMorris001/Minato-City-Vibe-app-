/**
 * Design tokens for the auth flow.
 * Sourced from design_handoff_auth_flow/README.md.
 */
export const AU = {
  bg: "#0B0613",
  bgStage: "#07040E",
  surface: "#1A1030",
  text: "#F4EEFF",
  textDim: "rgba(244,238,255,0.62)",
  textMute: "rgba(244,238,255,0.38)",
  stroke: "rgba(255,255,255,0.08)",
  strokeHi: "rgba(255,255,255,0.14)",
  purple: "#A855F7",
  purpleDeep: "#7C3AED",
  purpleSoft: "#C084FC",
  pink: "#EC4899",
  pinkSoft: "#FBCFE8",
  green: "#34D399",
  greenSoft: "#6EE7B7",
  amber: "#F59E0B",
  cyan: "#22D3EE",
} as const;

export const AU_GRADIENT_CTA = ["#A855F7", "#7C3AED", "#EC4899"] as const;
export const AU_GRADIENT_TEXT = ["#C084FC", "#EC4899"] as const;
export const AU_GRADIENT_PINK_PURPLE = ["#A855F7", "#EC4899"] as const;

export const AU_FONT = {
  display: "BricolageGrotesque_800ExtraBold",
  heavy: "BricolageGrotesque_800ExtraBold",
  bold: "BricolageGrotesque_700Bold",
  body: "Outfit_500Medium",
  bodySemi: "Outfit_600SemiBold",
  bodyBold: "Outfit_700Bold",
} as const;

export const POSTERS = [
  {
    title: "Side B",
    sub: "Bushwick · Sat",
    colors: ["#0B0613", "#7C3AED", "#EC4899"] as const,
    locations: [0, 0.6, 1] as const,
    emoji: "🎛️",
  },
  {
    title: "Sundowners",
    sub: "Westlight · Fri",
    colors: ["#22D3EE", "#7C3AED"] as const,
    locations: [0, 1] as const,
    emoji: "🌇",
  },
  {
    title: "House of Yes",
    sub: "Cabaret · Tonight",
    colors: ["#EC4899", "#7C3AED"] as const,
    locations: [0, 1] as const,
    emoji: "🎭",
  },
  {
    title: "Paragon",
    sub: "Techno · 11PM",
    colors: ["#A855F7", "#F59E0B"] as const,
    locations: [0, 1] as const,
    emoji: "⚡",
  },
  {
    title: "Public Records",
    sub: "Listening · Gowanus",
    colors: ["#22D3EE", "#0B0613"] as const,
    locations: [0, 1] as const,
    emoji: "🎧",
  },
  {
    title: "Mister Paradise",
    sub: "Cocktails · EV",
    colors: ["#F59E0B", "#EC4899"] as const,
    locations: [0, 1] as const,
    emoji: "🍸",
  },
];
