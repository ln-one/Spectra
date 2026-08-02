import { MinerU, MinerUError } from "mineru-open-sdk";
import { z } from "zod";
import type { SourceIngestionErrorCode } from "../types";
import { mineruEnvironment, mineruProcessingProfile } from "./config";
import { classifyMinerUResults } from "./mineru-result";

const inputSchema = z.discriminatedUnion("operation", [
  z
    .object({ operation: z.literal("submit"), filePath: z.string().min(1), ingestionId: z.uuid() })
    .strict(),
  z.object({ operation: z.literal("poll"), batchId: z.string().min(1) }).strict(),
]);

function stableProviderError(error: unknown): {
  errorCode: SourceIngestionErrorCode;
  retryable: boolean;
} {
  if (!(error instanceof MinerUError)) {
    return { errorCode: "mineru_unavailable", retryable: true };
  }
  if (error.name === "QuotaExceededError") {
    return { errorCode: "mineru_quota_exceeded", retryable: true };
  }
  if (error.name === "AuthError") {
    return { errorCode: "mineru_authentication", retryable: false };
  }
  if (
    error.name === "ParamError" ||
    error.name === "FileTooLargeError" ||
    error.name === "PageLimitError"
  ) {
    return { errorCode: "mineru_input_rejected", retryable: false };
  }
  if (error.name === "TaskNotFoundError") {
    return { errorCode: "mineru_task_not_found", retryable: true };
  }
  return { errorCode: "mineru_unavailable", retryable: true };
}

async function main() {
  const { getOneMessage, sendMessage } = await import("execa");
  const { apiToken } = mineruEnvironment();
  const input = inputSchema.parse(await getOneMessage());
  const mineru = new MinerU(apiToken);
  mineru.setSource("spectra");

  try {
    if (input.operation === "submit") {
      const batchId = await mineru.submit(input.filePath, {
        ...mineruProcessingProfile,
        fileParams: { [input.filePath]: { dataId: input.ingestionId } },
      });
      await sendMessage(
        batchId
          ? { kind: "submitted", batchId }
          : { kind: "error", errorCode: "mineru_result_invalid", retryable: true },
      );
      return;
    }

    await sendMessage(classifyMinerUResults(await mineru.getBatch(input.batchId)));
  } catch (error) {
    await sendMessage({ kind: "error", ...stableProviderError(error) });
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
