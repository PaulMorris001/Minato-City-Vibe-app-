/**
 * Theme Configuration
 * Centralized theme colors, fonts, and spacing.
 *
 * The dark palette values are the exact hexes the app was originally built
 * with, so a token always renders identically to the old hardcoded color in
 * dark mode. The light palette mirrors each token for light backgrounds.
 */

export const darkColors = {
  // Surfaces
  background: "#0f0f1a",
  backgroundDeep: "#0B0613",
  backgroundSecondary: "#1a1a2e",
  backgroundTertiary: "#16213e",
  card: "#1f1f2e",
  cardAlt: "#1f2937",
  border: "#374151",
  borderMuted: "#4b5563",

  // Text
  text: "#ffffff",
  textBright: "#F4EEFF",
  textBody: "#e5e7eb",
  textTertiary: "#d1d5db",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  textDim: "rgba(244, 238, 255, 0.62)",
  textFaint: "rgba(244, 238, 255, 0.42)",
  textGhost: "rgba(244, 238, 255, 0.3)",

  // Brand
  primary: "#a855f7",
  primaryDark: "#7c3aed",
  primaryLight: "#c084fc",
  primarySoft: "#e9d5ff",
  primaryFaded: "rgba(168, 85, 247, 0.1)",
  primaryFadedStrong: "rgba(168, 85, 247, 0.16)",
  primaryBorder: "rgba(168, 85, 247, 0.3)",

  // Accents (shared across schemes unless contrast demands otherwise)
  accentPink: "#EC4899",
  accentCyan: "#22D3EE",
  success: "#10b981",
  successLight: "#34D399",
  warning: "#f59e0b",
  warningLight: "#fbbf24",
  error: "#ef4444",
  errorLight: "#F87171",
  info: "#3b82f6",

  // Decorative purple card gradient (home event/guide cards)
  cardGradientStart: "#2D1B69",
  cardGradientEnd: "#1A1030",

  // Glass / translucent fills (white-on-dark in dark mode)
  glassFillSubtle: "rgba(255, 255, 255, 0.05)",
  glassFill: "rgba(255, 255, 255, 0.08)",
  glassStroke: "rgba(255, 255, 255, 0.1)",
  glassStrokeStrong: "rgba(255, 255, 255, 0.16)",

  // Event-details glass card surface (deep purple wash on dark, solid card
  // on light — see components/event-details/GlassCard.tsx)
  cardGlass: "rgba(26, 16, 48, 0.75)",
  cardGlassSoft: "rgba(26, 16, 48, 0.5)",

  // Overlays
  modalOverlay: "rgba(0, 0, 0, 0.7)",
  // Scrims sit on top of photos, so they stay dark in both schemes.
  imageScrim: "rgba(11, 6, 19, 0.55)",

  // Fixed colors that must not flip with the scheme (e.g. label on a purple
  // button). Referencing c.white documents that intent at the call site.
  white: "#ffffff",
  black: "#000000",
};

export type ThemeColors = typeof darkColors;

export const lightColors: ThemeColors = {
  // Surfaces
  background: "#ffffff",
  backgroundDeep: "#f7f5fb",
  backgroundSecondary: "#f3f4f6",
  backgroundTertiary: "#eef1f6",
  card: "#f6f6f9",
  cardAlt: "#eceef2",
  border: "#e5e7eb",
  borderMuted: "#d1d5db",

  // Text
  text: "#17171f",
  textBright: "#1b1030",
  textBody: "#374151",
  textTertiary: "#4b5563",
  textSecondary: "#6b7280",
  textMuted: "#6b7280",
  textDim: "rgba(27, 16, 48, 0.62)",
  textFaint: "rgba(27, 16, 48, 0.45)",
  textGhost: "rgba(27, 16, 48, 0.32)",

  // Brand
  primary: "#a855f7",
  primaryDark: "#7c3aed",
  primaryLight: "#9333ea",
  primarySoft: "#7e22ce",
  primaryFaded: "rgba(168, 85, 247, 0.1)",
  primaryFadedStrong: "rgba(168, 85, 247, 0.14)",
  primaryBorder: "rgba(168, 85, 247, 0.35)",

  // Accents
  accentPink: "#db2777",
  accentCyan: "#0891b2",
  success: "#059669",
  successLight: "#10b981",
  warning: "#d97706",
  warningLight: "#f59e0b",
  error: "#dc2626",
  errorLight: "#ef4444",
  info: "#2563eb",

  // Decorative purple card gradient (home event/guide cards)
  cardGradientStart: "#ede9fe",
  cardGradientEnd: "#faf5ff",

  // Glass / translucent fills (black-on-light in light mode)
  glassFillSubtle: "rgba(0, 0, 0, 0.04)",
  glassFill: "rgba(0, 0, 0, 0.05)",
  glassStroke: "rgba(0, 0, 0, 0.08)",
  glassStrokeStrong: "rgba(0, 0, 0, 0.12)",

  // Event-details glass card surface
  cardGlass: "#ffffff",
  cardGlassSoft: "rgba(255, 255, 255, 0.65)",

  // Overlays
  modalOverlay: "rgba(0, 0, 0, 0.45)",
  imageScrim: "rgba(11, 6, 19, 0.55)",

  // Fixed
  white: "#ffffff",
  black: "#000000",
};

export const theme = {
  colors: {
    light: lightColors,
    dark: darkColors,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
};

export type Theme = typeof theme;
export type ColorScheme = "light" | "dark";
