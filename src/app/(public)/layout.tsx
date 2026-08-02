import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { geistMono, geistSans } from "../app-fonts";
import { AppThemeProvider } from "../providers";
import "../globals.css";
import "../styles/workspace-theme/common.css";
import "../styles/workspace-theme/studio-tones.css";

export const metadata: Metadata = {
  title: "Spectra",
  description: "Multimodal knowledge creation workspace",
};

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html
      data-theme="light"
      lang={locale}
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <AppThemeProvider initialTheme="system">
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
