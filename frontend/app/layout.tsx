import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { Toaster } from "@/components/ui/toaster";
import { NotificationProvider } from "@/components/notification-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Spectra - AI Course Generator",
  description: "AI-powered course content generation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AuthBootstrap />
        {children}
        <Toaster />
        <NotificationProvider />
      </body>
    </html>
  );
}
