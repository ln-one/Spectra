import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export function canonicalJson(value: unknown) {
  const result = canonicalize(value);
  if (result === undefined) throw new TypeError("Value is not valid RFC 8785 JSON");
  return result;
}

export function canonicalJsonSha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
