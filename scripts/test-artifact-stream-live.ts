import { createOpenAI } from "@ai-sdk/openai";
import * as nextEnv from "@next/env";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { dashScopeEnvironment, dashScopeModels } from "@/ai/dashscope";

nextEnv.loadEnvConfig(process.cwd());

class LiveContractError extends Error {}

const documentBlockSchema = z
  .object({
    kind: z.enum(["heading", "paragraph", "bullet"]),
    text: z.string().trim().min(1),
  })
  .strict();

const documentSchema = z
  .object({
    blocks: z.array(documentBlockSchema).min(4).max(6),
    title: z.string().trim().min(1),
  })
  .strict();

const quizQuestionSchema = z
  .object({
    answerIndex: z.number().int().min(0).max(3),
    choices: z.array(z.string().trim().min(1)).length(4),
    explanation: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })
  .strict();

function hasRenderableDocumentContent(value: unknown) {
  const partial = z
    .object({
      blocks: z
        .array(
          z
            .object({
              text: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
      title: z.string().optional(),
    })
    .passthrough()
    .safeParse(value);
  if (!partial.success) return false;
  return (
    (partial.data.title?.trim().length ?? 0) > 0 ||
    (partial.data.blocks ?? []).some((block) => (block.text?.trim().length ?? 0) > 0)
  );
}

function tokenCounts(usage: Awaited<ReturnType<typeof runDocumentStream>>["usage"]) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

const { apiKey, baseURL } = dashScopeEnvironment();
const nonThinkingFetch: typeof fetch = async (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init);
  const body = z.record(z.string(), z.unknown()).parse(JSON.parse(init.body));
  return fetch(input, {
    ...init,
    body: JSON.stringify({ ...body, enable_thinking: false }),
  });
};
const provider = createOpenAI({ apiKey, baseURL, fetch: nonThinkingFetch });
const model = provider.chat(dashScopeModels.workspaceAgent);

async function runDocumentStream() {
  const startedAt = performance.now();
  const result = streamText({
    abortSignal: AbortSignal.timeout(120_000),
    maxOutputTokens: 768,
    maxRetries: 0,
    model,
    output: Output.object({ schema: documentSchema }),
    prompt:
      "生成一份非常简短的中文 TCP/IP 入门教学文档。返回标题和 4 至 6 个结构化内容块；内容块只使用 heading、paragraph、bullet。不要使用工具。",
    temperature: 0,
  });

  let firstRenderableMs: number | undefined;
  let partialSnapshots = 0;
  for await (const partial of result.partialOutputStream) {
    partialSnapshots += 1;
    if (firstRenderableMs === undefined && hasRenderableDocumentContent(partial)) {
      firstRenderableMs = Math.round(performance.now() - startedAt);
    }
  }

  const [output, usage] = await Promise.all([result.output, result.totalUsage]);
  const validated = documentSchema.parse(output);
  if (firstRenderableMs === undefined || partialSnapshots < 2) {
    throw new LiveContractError(
      `document partial stream was not observable: first=${firstRenderableMs}, snapshots=${partialSnapshots}`,
    );
  }

  return {
    blocks: validated.blocks.length,
    firstRenderableMs,
    latencyMs: Math.round(performance.now() - startedAt),
    partialSnapshots,
    usage,
  };
}

async function runElementStream() {
  const startedAt = performance.now();
  const result = streamText({
    abortSignal: AbortSignal.timeout(120_000),
    maxOutputTokens: 768,
    maxRetries: 0,
    model,
    output: Output.array({ element: quizQuestionSchema }),
    prompt:
      "生成 3 道非常简短的中文 TCP/IP 单选题。每题必须有 4 个选项、一个从 0 开始的正确答案索引和一句解析。不要使用工具。",
    temperature: 0,
  });

  let firstElementMs: number | undefined;
  let streamedElements = 0;
  for await (const element of result.elementStream) {
    quizQuestionSchema.parse(element);
    streamedElements += 1;
    firstElementMs ??= Math.round(performance.now() - startedAt);
  }

  const [output, usage] = await Promise.all([result.output, result.totalUsage]);
  const validated = z.array(quizQuestionSchema).length(3).parse(output);
  if (firstElementMs === undefined || streamedElements !== validated.length) {
    throw new LiveContractError(
      `element stream mismatch: first=${firstElementMs}, streamed=${streamedElements}, final=${validated.length}`,
    );
  }

  return {
    elements: validated.length,
    firstElementMs,
    latencyMs: Math.round(performance.now() - startedAt),
    usage,
  };
}

async function main() {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const document = await runDocumentStream();
    console.log(
      JSON.stringify({
        attempt,
        case: "document-partial-object",
        ...document,
        status: "passed",
        usage: tokenCounts(document.usage),
      }),
    );

    const elements = await runElementStream();
    console.log(
      JSON.stringify({
        attempt,
        case: "validated-element-array",
        ...elements,
        status: "passed",
        usage: tokenCounts(elements.usage),
      }),
    );
  }
  console.log(JSON.stringify({ attempts, status: "passed" }));
}

void main().catch((error: unknown) => {
  const detail =
    error instanceof LiveContractError
      ? error.message
      : NoObjectGeneratedError.isInstance(error)
        ? [
            error.name,
            `finish=${error.finishReason ?? "unknown"}`,
            `textLength=${error.text?.length ?? 0}`,
            `inputTokens=${error.usage?.inputTokens ?? "unknown"}`,
            `outputTokens=${error.usage?.outputTokens ?? "unknown"}`,
            `cause=${error.cause instanceof Error ? error.cause.name : "unknown"}`,
          ].join(",")
        : error instanceof Error
          ? error.name
          : "UnknownError";
  console.error(`Artifact structured streaming live smoke failed: ${detail}`);
  process.exitCode = 1;
});
