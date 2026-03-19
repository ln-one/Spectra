import { sdkClient, unwrap, withIdempotency } from "../client";

export { sdkClient, unwrap, withIdempotency };

export const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

export function nowIso(): string {
  return new Date().toISOString();
}
