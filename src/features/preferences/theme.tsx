"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  APP_RESOLVED_THEME_COOKIE_NAME,
  APP_THEME_COOKIE_NAME,
  type AppTheme,
  type ResolvedAppTheme,
} from "./theme-preference";

export type { AppTheme } from "./theme-preference";

const THEME_STORAGE_KEY = "theme";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const systemThemeQuery = "(prefers-color-scheme: dark)";

type AppThemeContextValue = {
  setTheme: (theme: AppTheme) => void;
  theme: AppTheme;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  setTheme: () => undefined,
  theme: "system",
});

function storedTheme(fallback: AppTheme): AppTheme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "dark" || value === "light" || value === "system") return value;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return fallback;
}

function writeThemeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: The server needs this preference before hydration.
  document.cookie = `${name}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function applyTheme(theme: AppTheme): ResolvedAppTheme {
  const resolved: ResolvedAppTheme =
    theme === "system" ? (window.matchMedia(systemThemeQuery).matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  writeThemeCookie(APP_THEME_COOKIE_NAME, theme);
  writeThemeCookie(APP_RESOLVED_THEME_COOKIE_NAME, resolved);
  return resolved;
}

export function AppThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: AppTheme;
}) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);

  useLayoutEffect(() => {
    const localTheme = storedTheme(initialTheme);
    setThemeState(localTheme);
    applyTheme(localTheme);
  }, [initialTheme]);

  useEffect(() => {
    const media = window.matchMedia(systemThemeQuery);
    const handleSystemChange = () => {
      if (theme === "system") applyTheme("system");
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = storedTheme(initialTheme);
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    };
    media.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      media.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [initialTheme, theme]);

  useEffect(() => {
    const root = document.documentElement;
    const setPointerFocusModality = () => {
      root.dataset.focusModality = "pointer";
    };
    const setKeyboardFocusModality = (event: KeyboardEvent) => {
      if (event.key === "Tab") root.dataset.focusModality = "keyboard";
    };

    setPointerFocusModality();
    window.addEventListener("pointerdown", setPointerFocusModality, true);
    window.addEventListener("keydown", setKeyboardFocusModality, true);
    return () => {
      window.removeEventListener("pointerdown", setPointerFocusModality, true);
      window.removeEventListener("keydown", setKeyboardFocusModality, true);
      delete root.dataset.focusModality;
    };
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Applying the in-memory preference still keeps this page usable.
    }
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const value = useMemo(() => ({ setTheme, theme }), [setTheme, theme]);
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
