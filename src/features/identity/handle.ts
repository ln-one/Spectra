import { z } from "zod";

const RESERVED_HANDLES = new Set([
  "_next",
  "admin",
  "api",
  "assets",
  "auth",
  "explore",
  "favicon.ico",
  "health",
  "login",
  "logout",
  "metrics",
  "robots.txt",
  "search",
  "settings",
  "signup",
  "sitemap.xml",
  "users",
  "workspaces",
]);

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/)
  .refine((handle) => !RESERVED_HANDLES.has(handle));

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase();
}

export function handleError(value: string) {
  const handle = normalizeHandle(value);
  if (RESERVED_HANDLES.has(handle)) return "handle_reserved" as const;
  if (!handleSchema.safeParse(handle).success) {
    return "handle_invalid" as const;
  }
  return null;
}
