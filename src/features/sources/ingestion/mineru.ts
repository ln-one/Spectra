import "server-only";

import { z } from "zod";
import { type SourceIngestionErrorCode, sourceIngestionErrorCodes } from "../types";
import { mineruEnvironment, parseMineruToken } from "./config";
import { MAX_MINERU_RESULT_BYTES } from "./mineru-result";

const MINERU_SUBMIT_CALL_TIMEOUT_MS = 6 * 60 * 1000;
export const MINERU_POLL_CALL_TIMEOUT_MS = 2 * 60 * 1000;
export const MINERU_FORCE_KILL_AFTER_MS = 1_000;
const mineruChildUrl = new URL("./mineru-child.ts", import.meta.url);
const errorCodeSchema = z.enum(sourceIngestionErrorCodes);
const execaFailureSchema = z.object({
  timedOut: z.boolean(),
  isMaxBuffer: z.boolean(),
  signal: z.string().nullable().optional(),
  exitCode: z.number().nullable().optional(),
});

const childResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("submitted"), batchId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("pending") }).strict(),
  z
    .object({ kind: z.literal("done"), zipBytes: z.instanceof(Uint8Array) })
    .strict()
    .refine((result) => result.zipBytes.byteLength <= MAX_MINERU_RESULT_BYTES),
  z
    .object({
      kind: z.literal("failed"),
      errorCode: errorCodeSchema,
      retryable: z.boolean(),
    })
    .strict(),
  z
    .object({ kind: z.literal("error"), errorCode: errorCodeSchema, retryable: z.boolean() })
    .strict(),
]);

type MinerUChildInput =
  | { operation: "submit"; filePath: string; ingestionId: string }
  | { operation: "poll"; batchId: string };

export type MinerUPollResult =
  | { kind: "pending" }
  | { kind: "done"; zipBytes: Uint8Array }
  | { kind: "failed"; errorCode: SourceIngestionErrorCode; retryable: boolean };

export interface MinerUProvider {
  submit(filePath: string, ingestionId: string): Promise<string>;
  poll(batchId: string): Promise<MinerUPollResult>;
}

export class MinerUProviderError extends Error {
  constructor(
    readonly errorCode: SourceIngestionErrorCode,
    readonly retryable: boolean,
  ) {
    super(errorCode);
    this.name = "MinerUProviderError";
  }
}

function providerError(error: unknown): MinerUProviderError {
  const parsed = execaFailureSchema.safeParse(error);
  if (parsed.success) {
    if (parsed.data.timedOut) return new MinerUProviderError("mineru_timeout", true);
    if (
      parsed.data.isMaxBuffer ||
      parsed.data.signal === "SIGABRT" ||
      parsed.data.signal === "SIGKILL" ||
      parsed.data.exitCode === 134
    ) {
      return new MinerUProviderError("mineru_resource_limit", false);
    }
  }
  return new MinerUProviderError("mineru_unavailable", true);
}

export async function runMinerUChild(
  input: MinerUChildInput,
  token: string,
  options: { cancelSignal?: AbortSignal; childUrl?: URL; timeoutMs?: number } = {},
) {
  try {
    const { execaNode } = await import("execa");
    const result = await execaNode(options.childUrl ?? mineruChildUrl, [], {
      ipcInput: input,
      env: { MINERU_API_TOKEN: token },
      extendEnv: false,
      nodeOptions: ["--conditions=react-server", "--import=tsx", "--max-old-space-size=512"],
      timeout:
        options.timeoutMs ??
        (input.operation === "submit"
          ? MINERU_SUBMIT_CALL_TIMEOUT_MS
          : MINERU_POLL_CALL_TIMEOUT_MS),
      forceKillAfterDelay: MINERU_FORCE_KILL_AFTER_MS,
      ...(options.cancelSignal ? { cancelSignal: options.cancelSignal } : {}),
      maxBuffer: MAX_MINERU_RESULT_BYTES,
      stdout: "ignore",
      stderr: "ignore",
    });
    const parsed = childResultSchema.safeParse(result.ipcOutput[0]);
    if (!parsed.success || result.ipcOutput.length !== 1) {
      throw new MinerUProviderError("mineru_result_invalid", true);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof MinerUProviderError) throw error;
    throw providerError(error);
  }
}

export function createMinerUProvider(token?: string, cancelSignal?: AbortSignal): MinerUProvider {
  const childOptions = cancelSignal ? { cancelSignal } : undefined;
  const explicitApiToken = token === undefined ? undefined : parseMineruToken(token);
  const apiToken = () => explicitApiToken ?? parseMineruToken(mineruEnvironment().apiToken);
  return {
    async submit(filePath, ingestionId) {
      const result = await runMinerUChild(
        { operation: "submit", filePath, ingestionId },
        apiToken(),
        childOptions,
      );
      if (result.kind === "error") {
        throw new MinerUProviderError(result.errorCode, result.retryable);
      }
      if (result.kind !== "submitted") {
        throw new MinerUProviderError("mineru_result_invalid", true);
      }
      return result.batchId;
    },

    async poll(batchId) {
      const result = await runMinerUChild({ operation: "poll", batchId }, apiToken(), childOptions);
      if (result.kind === "error") {
        throw new MinerUProviderError(result.errorCode, result.retryable);
      }
      if (result.kind === "submitted") {
        throw new MinerUProviderError("mineru_result_invalid", true);
      }
      return result;
    },
  };
}
