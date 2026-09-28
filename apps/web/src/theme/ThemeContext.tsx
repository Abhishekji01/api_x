/**
 * Theme state — light only, and fixed, not OS-driven. The dashboard uses a light,
 * official-statistics design (index.css / theme/tokens.ts's LIGHT export) and stamps
 * `data-theme="light"` itself: an earlier version *followed* `prefers-color-scheme`,
 * which flipped panels for anyone on a dark OS theme whether or not that design was
 * ready. Re-introduce preference switching only alongside a real, user-facing toggle.
 */

import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { tokensFor } from "./tokens";
import type { ThemeMode, ThemeTokens } from "./tokens";

type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  tokens: ThemeTokens;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MODE: ThemeMode = "light";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset["theme"] = MODE;
    document.documentElement.style.colorScheme = MODE;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference: MODE,
      mode: MODE,
      tokens: tokensFor(MODE),
      setPreference: () => {
        /* no-op until a real light-mode toggle exists */
      },
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error("useTheme called outside ThemeProvider");
  return value;
}
