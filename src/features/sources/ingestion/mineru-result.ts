import { z } from "zod";
import type { SourceIngestionErrorCode } from "../types";

export const MAX_MINERU_RESULT_BYTES = 256 * 1024 * 1024;
const pendingStates = new Set(["waiting-file", "pending", "running"]);

const mineruResultSchema = z.object({
  state: z.string().regex(/^[a-z][a-z_-]{0,31}$/),
  errCode: z.string(),
  error: z.string().nullable(),
  _zipBytes: z.instanceof(Uint8Array).nullable(),
});

export type MinerUChildResult =
  | { kind: "submitted"; batchId: string }
  | { kind: "pending" }
  | { kind: "done"; zipBytes: Uint8Array }
  | { kind: "failed"; errorCode: SourceIngestionErrorCode; retryable: boolean }
  | { kind: "error"; errorCode: SourceIngestionErrorCode; retryable: boolean };

export function classifyMinerUResults(results: unknown): MinerUChildResult {
  const parsed = z.array(mineruResultSchema).safeParse(results);
  if (!parsed.success || parsed.data.length !== 1) {
    return { kind: "error", errorCode: "mineru_result_invalid", retryable: true };
  }
  const result = parsed.data[0];
  if (!result) return { kind: "error", errorCode: "mineru_result_invalid", retryable: true };
  if (result.state === "failed") {
    return {
      kind: "failed",
      errorCode: result.errCode ? "mineru_provider_failed" : "mineru_result_invalid",
      retryable: true,
    };
  }
  if (pendingStates.has(result.state)) return { kind: "pending" };
  if (result.state !== "done") {
    return { kind: "error", errorCode: "mineru_result_invalid", retryable: false };
  }
  if (!result._zipBytes || result._zipBytes.byteLength < 2) {
    return { kind: "error", errorCode: "mineru_result_invalid", retryable: false };
  }
  if (result._zipBytes.byteLength > MAX_MINERU_RESULT_BYTES) {
    return { kind: "error", errorCode: "mineru_resource_limit", retryable: false };
  }
  if (result._zipBytes[0] !== 0x50 || result._zipBytes[1] !== 0x4b) {
    return { kind: "error", errorCode: "mineru_result_invalid", retryable: false };
  }
  return { kind: "done", zipBytes: result._zipBytes };
}
