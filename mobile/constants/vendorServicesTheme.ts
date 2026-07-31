/**
 * Palette for the vendor services redesign (design_handoff_vendor_services,
 * option 1a). The handoff ships its own token table whose surfaces sit a shade
 * deeper/softer than the app-wide ones in constants/theme.ts, so the screen
 * reads them from here instead of guessing at the closest global token. Both
 * schemes are covered — nothing on the screen may hardcode a per-theme value.
 *
 * Brand accents (gradient, gold, teal) are theme-independent by design; the
 * violet ink is the one exception — #c39cff is unreadable on the light canvas,
 * so light mode uses the app's light violet instead.
 */
import { useTheme } from "@/contexts/ThemeContext";

export interface ServicesTokens {
  /** Screen canvas. */
  app: string;
  /** Row / card surface. */
  card: string;
  /** Raised surface: count pills, meta tiles, empty-state icon well. */
  card2: string;
  /** Hairline border. */
  line: string;
  /** Strong text. */
  t1: string;
  /** Muted text. */
  t2: string;
  /** Faint text. */
  t3: string;
  /** Trust-strip fill + ink. */
  warnBg: string;
  warnInk: string;
  /** Violet ink for links and outlined actions. */
  violetInk: string;
}

const dark: ServicesTokens = {
  app: "#0b0813",
  card: "#16111f",
  card2: "#1e1830",
  line: "rgba(255,255,255,0.07)",
  t1: "#ffffff",
  t2: "#a79fb8",
  t3: "#6f6885",
  warnBg: "rgba(245,185,66,0.12)",
  warnInk: "#f5b942",
  violetInk: "#c39cff",
};

const light: ServicesTokens = {
  app: "#faf8fe",
  card: "#ffffff",
  card2: "#f2edfb",
  line: "rgba(11,8,19,0.09)",
  t1: "#16111f",
  t2: "#6b6480",
  t3: "#9a94ab",
  warnBg: "#fdf2dd",
  warnInk: "#8a5a12",
  violetInk: "#7e22ce",
};

export const servicesTokens = { dark, light };

/** Brand accents — identical in both schemes. */
export const Brand = {
  violet: "#a855f7",
  magenta: "#e0219f",
  /** linear-gradient(100deg, violet, magenta) — 100deg ≈ left→right, tipped down. */
  gradient: ["#a855f7", "#e0219f"] as const,
  gradientStart: { x: 0, y: 0 },
  gradientEnd: { x: 1, y: 0.18 },
  /** Avatar fallback fill: linear-gradient(135deg,#e0219f,#7c22d6). */
  avatarGradient: ["#e0219f", "#7c22d6"] as const,
  gold: "#f5b942",
  teal: "#22c9a5",
  tealInk: "#06231d",
  red: "#ef5350",
  /** Border/ink for the outlined "Rate vendor" style actions. */
  violetOutline: "rgba(168,85,247,0.45)",
  glow: "rgba(168,85,247,0.35)",
} as const;

export const Radii = {
  smallButton: 12,
  thumb: 14,
  row: 18,
  bar: 20,
  sheet: 28,
  emptyIcon: 26,
  pill: 999,
} as const;

/** Resolved handoff palette for the active scheme. */
export function useServicesTokens(): ServicesTokens {
  const { isDark } = useTheme();
  return isDark ? dark : light;
}
