import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { tokensFor } from "./tokens";
import type { ThemeMode, ThemeTokens } from "./tokens";

type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  tokens: ThemeTokens;
  setPreference: (preference: ThemePreference) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "apix_theme_preference";

function getSavedPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light" || saved === "system") {
      return saved;
    }
  } catch {
    // fallback
  }
  return "system";
}

function resolveSystemMode(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getSavedPreference);
  const [systemMode, setSystemMode] = useState<ThemeMode>(resolveSystemMode);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemMode(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const mode: ThemeMode = preference === "system" ? systemMode : preference;

  useEffect(() => {
    document.documentElement.dataset["theme"] = mode;
    document.documentElement.style.colorScheme = mode;
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [mode]);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // ignore
    }
  };

  const toggleMode = () => {
    setPreference(mode === "dark" ? "light" : "dark");
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      mode,
      tokens: tokensFor(mode),
      setPreference,
      toggleMode,
    }),
    [preference, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error("useTheme called outside ThemeProvider");
  return value;
}

