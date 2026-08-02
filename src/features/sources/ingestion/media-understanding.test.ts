import {
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "openai";
import { describe, expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { mediaUnderstandingProfile } from "./config";
import {
  analyzeMedia,
  buildMediaContent,
  buildMediaRequest,
  createMediaUnderstandingClient,
  MediaUnderstandingError,
  mediaInputSchema,
  mediaUnderstandingFailure,
  parseMediaCompletion,
} from "./media-understanding";

function completion(argumentsValue: string, usage = true) {
  return {
    choices: [
      {
        message: {
          tool_calls: [
            {
              type: "function",
              function: { name: "publish_media_analysis", arguments: argumentsValue },
            },
          ],
        },
      },
    ],
    ...(usage ? { usage: { prompt_tokens: 100, completion_tokens: 20 } } : {}),
  };
}

describe("media understanding adapter", () => {
  test("accepts strict HTTPS and bounded media data inputs", () => {
    expect(
      mediaInputSchema.parse({
        kind: "audio",
        url: "https://media.invalid/test.aac",
        format: "aac",
      }),
    ).toEqual({ kind: "audio", url: "https://media.invalid/test.aac", format: "aac" });
    expect(() =>
      mediaInputSchema.parse({ kind: "video", url: "http://media.invalid/test.mp4" }),
    ).toThrow();
    expect(
      mediaInputSchema.parse({
        kind: "audio",
        url: "data:audio/mpeg;base64,U3BlY3RyYQ==",
        format: "mp3",
      }),
    ).toEqual({
      kind: "audio",
      url: "data:audio/mpeg;base64,U3BlY3RyYQ==",
      format: "mp3",
    });
    expect(() =>
      mediaInputSchema.parse({ kind: "video", url: "data:text/plain;base64,U3BlY3RyYQ==" }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({
        kind: "audio",
        url: "data:video/mp4;base64,U3BlY3RyYQ==",
        format: "mp3",
      }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({
        kind: "audio",
        url: "data:audio/wav;base64,U3BlY3RyYQ==",
        format: "mp3",
      }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({ kind: "video", url: "data:audio/mpeg;base64,U3BlY3RyYQ==" }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({ kind: "video", url: "data:video/mp4;base64,not base64" }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({ kind: "image", url: "https://user:secret@media.invalid/a.jpg" }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({
        kind: "audio",
        url: "https://media.invalid/test.flac",
        format: "flac",
      }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({
        kind: "video",
        url: "https://media.invalid/test.mp4",
        workspaceId: "forged",
      }),
    ).toThrow();
  });

  test("maps each modality to the DashScope content contract", () => {
    expect(buildMediaContent({ kind: "image", url: "https://media.invalid/image.jpg" })[0]).toEqual(
      {
        type: "image_url",
        image_url: { url: "https://media.invalid/image.jpg" },
      },
    );
    expect(
      buildMediaContent({
        kind: "audio",
        url: "https://media.invalid/audio.wav",
        format: "wav",
      })[0],
    ).toEqual({
      type: "input_audio",
      input_audio: { data: "https://media.invalid/audio.wav", format: "wav" },
    });
    expect(buildMediaContent({ kind: "video", url: "https://media.invalid/video.mp4" })[0]).toEqual(
      {
        type: "video_url",
        video_url: { url: "https://media.invalid/video.mp4" },
      },
    );
  });

  test("uses the fixed model and a forced strict function call", () => {
    const request = buildMediaRequest({ kind: "video", url: "https://media.invalid/video.mp4" });
    expect(request).toMatchObject({
      model: "qwen3.5-omni-flash-2026-03-15",
      modalities: ["text"],
      max_tokens: 1024,
      temperature: 0,
      tool_choice: { type: "function", function: { name: "publish_media_analysis" } },
      tools: [
        {
          type: "function",
          function: { name: "publish_media_analysis", strict: true },
        },
      ],
    });
  });

  test("validates tool results and usage without repairing JSON", () => {
    expect(
      parseMediaCompletion(
        completion(
          JSON.stringify({
            summary: "A person speaks.",
            segments: [{ startMs: 0, endMs: 1000, description: "Speech begins." }],
          }),
        ),
        { kind: "video", url: "https://media.invalid/video.mp4" },
      ),
    ).toEqual({
      summary: "A person speaks.",
      segments: [{ startMs: 0, endMs: 1000, description: "Speech begins." }],
      usage: { promptTokens: 100, completionTokens: 20 },
    });
    expect(
      parseMediaCompletion(
        completion(JSON.stringify({ summary: "An image.", segments: [] }), false),
        {
          kind: "image",
          url: "https://media.invalid/image.jpg",
        },
      ),
    ).toEqual({ summary: "An image.", segments: [], usage: {} });

    for (const invalid of [
      completion('{"summary":"broken"}```'),
      completion(JSON.stringify({ summary: "No timeline.", segments: [] })),
      completion(
        JSON.stringify({
          summary: "Bad timeline.",
          segments: [{ startMs: 1000, endMs: 500, description: "Reversed." }],
        }),
      ),
      { choices: [{ message: {} }] },
    ]) {
      expect(() =>
        parseMediaCompletion(invalid, {
          kind: "video",
          url: "https://media.invalid/video.mp4",
        }),
      ).toThrowError(new MediaUnderstandingError("media_result_invalid"));
    }
  });

  test("rejects fake image timelines and leaked signed URLs", () => {
    expect(() =>
      parseMediaCompletion(
        completion(
          JSON.stringify({
            summary: "An image.",
            segments: [{ startMs: 0, endMs: 1000, description: "Invented timeline." }],
          }),
        ),
        { kind: "image", url: "https://media.invalid/image.jpg" },
      ),
    ).toThrowError(new MediaUnderstandingError("media_result_invalid"));

    for (const text of [
      "https://media.invalid/video.mp4?X-Amz-Signature=secret",
      "The source used X-Amz-Credential=secret.",
    ]) {
      expect(() =>
        parseMediaCompletion(
          completion(
            JSON.stringify({
              summary: text,
              segments: [{ startMs: 0, endMs: 1000, description: "Scene." }],
            }),
          ),
          {
            kind: "video",
            url: "https://media.invalid/video.mp4?X-Amz-Signature=secret",
          },
        ),
      ).toThrowError(new MediaUnderstandingError("media_result_invalid"));
    }
  });

  test("maps invalid adapter input to a stable error", async () => {
    await expect(
      analyzeMedia({ kind: "video", url: "http://media.invalid/video.mp4" }),
    ).rejects.toEqual(new MediaUnderstandingError("media_input_rejected"));
  });

  test("maps provider failures to stable redacted errors", () => {
    const headers = new Headers();
    const cases = [
      [
        new AuthenticationError(
          401,
          { message: "https://signed.invalid/?secret=1" },
          undefined,
          headers,
        ),
        "media_authentication",
      ],
      [new RateLimitError(429, { message: "quota" }, undefined, headers), "media_rate_limited"],
      [
        new BadRequestError(400, { message: "bad media" }, undefined, headers),
        "media_input_rejected",
      ],
      [new APIConnectionTimeoutError(), "media_timeout"],
      [new APIUserAbortError(), "media_aborted"],
      [new Error("provider secret"), "media_unavailable"],
    ] as const;

    for (const [providerError, code] of cases) {
      const mapped = mediaUnderstandingFailure(providerError);
      expect(mapped.code).toBe(code);
      expect(mapped.message).toBe(code);
      expect(JSON.stringify(mapped)).not.toContain("signed.invalid");
      expect(JSON.stringify(mapped)).not.toContain("provider secret");
    }
  });

  test("creates the official client from the centralized profile", () => {
    const client = createMediaUnderstandingClient(
      testServerEnvironment({
        DASHSCOPE_API_KEY: "test-key",
        DASHSCOPE_BASE_URL: "https://dashscope.invalid/compatible-mode/v1",
      }),
    );
    expect(client.baseURL).toBe("https://dashscope.invalid/compatible-mode/v1");
    expect(client.maxRetries).toBe(mediaUnderstandingProfile.maxRetries);
    expect(client.timeout).toBe(mediaUnderstandingProfile.timeoutMs);
  });
});
