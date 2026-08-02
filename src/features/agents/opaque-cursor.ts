import "server-only";

import { z } from "zod";

const opaqueCursorSchema = z.string().min(1).max(512);

export function encodeOpaqueCursor(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeOpaqueCursor<T>(
  value: string,
  parse: (value: unknown) => T | null,
): T | null {
  if (!opaqueCursorSchema.safeParse(value).success) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    return parse(decoded);
  } catch {
    return null;
  }
}
