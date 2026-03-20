import {
  apiFetch,
  sdkClient,
  toApiError,
  unwrap,
  withIdempotency,
} from "../client";

export { apiFetch, sdkClient, toApiError, unwrap, withIdempotency };

export const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

export function nowIso(): string {
  return new Date().toISOString();
}
