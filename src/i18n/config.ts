import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

const locales = ["zh-CN", "en-US"] as const;
export type Locale = (typeof locales)[number];

const defaultLocale: Locale = "zh-CN";
export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function negotiateLocale(savedLocale?: string, acceptLanguage?: string | null): Locale {
  if (isLocale(savedLocale)) return savedLocale;
  if (!acceptLanguage) return defaultLocale;

  try {
    const requested = new Negotiator({
      headers: { "accept-language": acceptLanguage },
    }).languages();
    return match(requested, locales, defaultLocale) as Locale;
  } catch {
    return defaultLocale;
  }
}
