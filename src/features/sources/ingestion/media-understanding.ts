import "server-only";

import OpenAI, {
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionStreamParams,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { dashScopeEnvironment } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";
import { mediaUnderstandingProfile } from "./config";

const httpsUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.username === "" && url.password === "";
}, "Media URL must use HTTPS without embedded credentials");

const base64Data = "[A-Za-z0-9+/]+={0,2}";
const mp3DataUrlSchema = z
  .string()
  .max(10_000_000)
  .regex(new RegExp(`^data:audio/mpeg;base64,${base64Data}$`));
const wavDataUrlSchema = z
  .string()
  .max(10_000_000)
  .regex(new RegExp(`^data:audio/wav;base64,${base64Data}$`));
const aacDataUrlSchema = z
  .string()
  .max(10_000_000)
  .regex(new RegExp(`^data:audio/aac;base64,${base64Data}$`));
const videoDataUrlSchema = z
  .string()
  .max(10_000_000)
  .regex(new RegExp(`^data:video/[a-z0-9.+-]+;base64,${base64Data}$`));

export const mediaInputSchema = z.union([
  z.object({ kind: z.literal("image"), url: httpsUrlSchema }).strict(),
  z
    .object({
      kind: z.literal("audio"),
      url: z.union([httpsUrlSchema, wavDataUrlSchema]),
      format: z.literal("wav"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("audio"),
      url: z.union([httpsUrlSchema, mp3DataUrlSchema]),
      format: z.literal("mp3"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("audio"),
      url: z.union([httpsUrlSchema, aacDataUrlSchema]),
      format: z.literal("aac"),
    })
    .strict(),
  z
    .object({ kind: z.literal("video"), url: z.union([httpsUrlSchema, videoDataUrlSchema]) })
    .strict(),
]);

const mediaSegmentSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    description: z.string().trim().min(1),
  })
  .strict()
  .refine((segment) => segment.endMs > segment.startMs, "Segment end must follow its start");

const mediaAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1),
    segments: z.array(mediaSegmentSchema),
  })
  .strict();

const completionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              type: z.literal("function"),
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .optional(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
});

export type MediaInput = z.infer<typeof mediaInputSchema>;
export type MediaUnderstandingResult = z.infer<typeof mediaAnalysisSchema> & {
  usage: { promptTokens?: number; completionTokens?: number };
};

const mediaUnderstandingErrorCodes = [
  "media_authentication",
  "media_rate_limited",
  "media_input_rejected",
  "media_timeout",
  "media_unavailable",
  "media_result_invalid",
  "media_aborted",
] as const;
export type MediaUnderstandingErrorCode = (typeof mediaUnderstandingErrorCodes)[number];

export class MediaUnderstandingError extends Error {
  constructor(readonly code: MediaUnderstandingErrorCode) {
    super(code);
    this.name = "MediaUnderstandingError";
  }
}

type DashScopeVideoPart = { type: "video_url"; video_url: { url: string } };
type DashScopeAudioPart = {
  type: "input_audio";
  input_audio: { data: string; format: "wav" | "mp3" | "aac" };
};
type DashScopeContentPart = ChatCompletionContentPart | DashScopeVideoPart | DashScopeAudioPart;
type DashScopeStreamParams = Omit<ChatCompletionStreamParams, "messages"> & {
  messages: [{ role: "user"; content: DashScopeContentPart[] }];
};

export function buildMediaContent(input: MediaInput): DashScopeContentPart[] {
  const media =
    input.kind === "image"
      ? { type: "image_url" as const, image_url: { url: input.url } }
      : input.kind === "audio"
        ? {
            type: "input_audio" as const,
            input_audio: { data: input.url, format: input.format },
          }
        : { type: "video_url" as const, video_url: { url: input.url } };
  const prompt =
    input.kind === "image"
      ? "Describe the image accurately in factual plain text. Never include the media URL or credentials."
      : "Describe the media accurately in factual plain text. Include visible text and spoken words when identifiable, and chronological details when they are clear. Never include the media URL or credentials.";
  return [media, { type: "text", text: prompt }];
}

export function buildMediaRequest(input: MediaInput): DashScopeStreamParams {
  return {
    model: mediaUnderstandingProfile.modelId,
    messages: [{ role: "user", content: buildMediaContent(input) }],
    modalities: ["text"],
    max_tokens: mediaUnderstandingProfile.maxOutputTokens,
    temperature: mediaUnderstandingProfile.temperature,
  };
}

function openAIParameters(input: MediaInput): ChatCompletionStreamParams {
  // DashScope extends OpenAI Chat Completions with URL audio and video content parts.
  return buildMediaRequest(input) as ChatCompletionStreamParams;
}

export function parseMediaCompletion(
  completion: unknown,
  input: MediaInput,
): MediaUnderstandingResult {
  const parsedCompletion = completionSchema.safeParse(completion);
  if (!parsedCompletion.success) throw new MediaUnderstandingError("media_result_invalid");
  const message = parsedCompletion.data.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (call) => call.function.name === "publish_media_analysis",
  );

  let analysis: z.infer<typeof mediaAnalysisSchema>;
  if (toolCall) {
    let argumentsValue: unknown;
    try {
      argumentsValue = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new MediaUnderstandingError("media_result_invalid");
    }
    const parsedAnalysis = mediaAnalysisSchema.safeParse(argumentsValue);
    if (!parsedAnalysis.success) throw new MediaUnderstandingError("media_result_invalid");
    analysis = parsedAnalysis.data;
  } else {
    const content = message?.content?.trim();
    const parsedAnalysis = mediaAnalysisSchema.safeParse({
      summary: content,
      segments:
        input.kind === "image" || !content ? [] : [{ startMs: 0, endMs: 1, description: content }],
    });
    if (!parsedAnalysis.success) throw new MediaUnderstandingError("media_result_invalid");
    analysis = parsedAnalysis.data;
  }
  if (
    (input.kind === "image" && analysis.segments.length !== 0) ||
    (input.kind !== "image" && analysis.segments.length === 0)
  ) {
    throw new MediaUnderstandingError("media_result_invalid");
  }
  const outputText = [analysis.summary, ...analysis.segments.map((item) => item.description)];
  const credentialMarker =
    /(x-amz-(?:signature|credential|security-token)|ossaccesskeyid|security-token|signature)=/i;
  if (outputText.some((text) => text.includes(input.url) || credentialMarker.test(text))) {
    throw new MediaUnderstandingError("media_result_invalid");
  }
  const usage = parsedCompletion.data.usage;
  return {
    ...analysis,
    usage: {
      ...(usage?.prompt_tokens !== undefined ? { promptTokens: usage.prompt_tokens } : {}),
      ...(usage?.completion_tokens !== undefined
        ? { completionTokens: usage.completion_tokens }
        : {}),
    },
  };
}

export function mediaUnderstandingFailure(error: unknown): MediaUnderstandingError {
  if (error instanceof MediaUnderstandingError) return error;
  if (error instanceof APIUserAbortError) return new MediaUnderstandingError("media_aborted");
  if (error instanceof APIConnectionTimeoutError) {
    return new MediaUnderstandingError("media_timeout");
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new MediaUnderstandingError("media_authentication");
  }
  if (error instanceof RateLimitError) return new MediaUnderstandingError("media_rate_limited");
  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
    return new MediaUnderstandingError("media_input_rejected");
  }
  return new MediaUnderstandingError("media_unavailable");
}

export function createMediaUnderstandingClient(
  environment: ServerEnvironment = serverEnvironment(),
) {
  const { apiKey, baseURL } = dashScopeEnvironment(environment);
  return new OpenAI({
    apiKey,
    baseURL,
    maxRetries: mediaUnderstandingProfile.maxRetries,
    timeout: mediaUnderstandingProfile.timeoutMs,
  });
}

export async function analyzeMedia(
  input: MediaInput,
  options: { client?: OpenAI; signal?: AbortSignal } = {},
): Promise<MediaUnderstandingResult> {
  const parsedInput = mediaInputSchema.safeParse(input);
  if (!parsedInput.success) throw new MediaUnderstandingError("media_input_rejected");
  const client = options.client ?? createMediaUnderstandingClient();
  try {
    const stream = client.chat.completions.stream(openAIParameters(parsedInput.data), {
      signal: options.signal,
    });
    return parseMediaCompletion(await stream.finalChatCompletion(), parsedInput.data);
  } catch (error) {
    throw mediaUnderstandingFailure(error);
  }
}
