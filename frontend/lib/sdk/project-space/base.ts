import {
  apiFetch,
  sdkClient,
  toApiError,
  unwrap as unwrapClient,
  withIdempotency,
} from "../client";

export { apiFetch, sdkClient, toApiError, withIdempotency };

export const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

export function nowIso(): string {
  return new Date().toISOString();
}

type LegacyEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

function isLegacyEnvelope<T>(value: unknown): value is LegacyEnvelope<T> {
  return !!value && typeof value === "object" && "data" in value;
}

export async function unwrap<T>(result: {
  data?: unknown;
  error?: unknown;
  response?: Response;
}): Promise<T> {
  const payload = await unwrapClient<unknown>(result);
  if (isLegacyEnvelope<T>(payload)) {
    return payload.data as T;
  }
  return payload as T;
}
