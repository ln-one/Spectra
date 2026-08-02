import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { type Locale, localeCookieName, negotiateLocale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const savedLocale = (await cookies()).get(localeCookieName)?.value;
  const acceptLanguage = (await headers()).get("accept-language");
  return negotiateLocale(savedLocale, acceptLanguage);
}

async function messagesFor(locale: Locale) {
  if (locale === "en-US") return (await import("../../messages/en-US.json")).default;
  return (await import("../../messages/zh-CN.json")).default;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: await messagesFor(locale) };
});
