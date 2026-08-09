export { handleError, normalizeHandle } from "@/features/identity/handle";

// Password policy: 8–128 characters, mixing at least two character classes
// (lowercase, uppercase, digits, symbols). Single-class passwords such as
// "aaaaaaaa" or "12345678" are rejected.
function countCharacterClasses(value: string) {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(value)) classes += 1;
  return classes;
}

export function passwordError(value: string) {
  if (value.length < 8) return "password_short" as const;
  if (value.length > 128) return "password_long" as const;
  if (countCharacterClasses(value) < 2) return "password_classes" as const;
  return null;
}
