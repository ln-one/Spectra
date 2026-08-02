import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import {
  APP_RESOLVED_THEME_COOKIE_NAME,
  APP_THEME_COOKIE_NAME,
  parseAppTheme,
  parseResolvedAppTheme,
} from "@/features/preferences/theme-preference";
import { geistMono, geistSans } from "../app-fonts";
import { AppThemeProvider } from "../providers";
import "../styles/workspace.css";

export const metadata: Metadata = {
  title: "Spectra",
  description: "Multimodal knowledge creation workspace",
};

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages, cookieStore] = await Promise.all([
    getLocale(),
    getMessages(),
    cookies(),
  ]);
  const initialTheme = parseAppTheme(cookieStore.get(APP_THEME_COOKIE_NAME)?.value);
  const initialResolvedTheme =
    initialTheme === "system"
      ? parseResolvedAppTheme(cookieStore.get(APP_RESOLVED_THEME_COOKIE_NAME)?.value)
      : initialTheme;

  return (
    <html
      data-theme={initialResolvedTheme}
      lang={locale}
      style={{ colorScheme: initialResolvedTheme }}
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <AppThemeProvider initialTheme={initialTheme}>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
