import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  darkColors,
  lightColors,
  type ThemeColors,
  type ColorScheme,
} from "@/constants/theme";

export type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCE_KEY = "themePreference";

interface ThemeContextValue {
  /** Resolved scheme actually rendered ("light" | "dark"). */
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  /** What the user picked in Settings ("system" follows the OS). */
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: "dark",
  isDark: true,
  colors: darkColors,
  preference: "system",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Hydrate the persisted preference once on mount. Until it loads we render
  // with "system", which matches what most users will have picked anyway.
  useEffect(() => {
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, pref).catch(() => {});
  }, []);

  const scheme: ColorScheme =
    preference === "system" ? (systemScheme ?? "dark") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      isDark: scheme === "dark",
      colors: scheme === "dark" ? darkColors : lightColors,
      preference,
      setPreference,
    }),
    [scheme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Build a themed StyleSheet from a module-level factory:
 *
 *   const createStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(createStyles);
 *
 * The factory should be declared at module scope so its identity is stable
 * and the sheet is only rebuilt when the scheme flips.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (c: ThemeColors) => T
): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
