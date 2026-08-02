export { handleError, normalizeHandle } from "@/features/identity/handle";

export function passwordError(value: string) {
  if (value.length < 15 || value.length > 128) return "password_length" as const;
  return null;
}
