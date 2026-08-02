export const APP_THEME_COOKIE_NAME = "spectra-theme";
export const APP_RESOLVED_THEME_COOKIE_NAME = "spectra-resolved-theme";

export type AppTheme = "dark" | "light" | "system";
export type ResolvedAppTheme = Exclude<AppTheme, "system">;

export function parseAppTheme(value: string | undefined): AppTheme {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}

export function parseResolvedAppTheme(value: string | undefined): ResolvedAppTheme {
  return value === "dark" ? "dark" : "light";
}
