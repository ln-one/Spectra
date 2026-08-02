"use client";

import type { ReactNode } from "react";
import { AppThemeProvider as PreferenceThemeProvider } from "@/features/preferences/theme";
import type { AppTheme } from "@/features/preferences/theme-preference";

export function AppThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: AppTheme;
}) {
  return <PreferenceThemeProvider initialTheme={initialTheme}>{children}</PreferenceThemeProvider>;
}
