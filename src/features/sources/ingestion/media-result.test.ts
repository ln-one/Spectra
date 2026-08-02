import { expect, test } from "vitest";
import {
  sourceAudioAnalysis,
  sourceAudioAnalysisSchema,
  sourceVideoAnalysis,
  sourceVideoAnalysisSchema,
} from "./media-result";

test("builds a versioned normalized audio result without provider data", () => {
  expect(
    sourceAudioAnalysis("wav", {
      summary: "Lecture summary",
      segments: [{ startMs: 0, endMs: 500, description: "Opening" }],
      usage: { promptTokens: 5 },
    }),
  ).toEqual({
    schemaVersion: 1,
    kind: "audio",
    format: "wav",
    summary: "Lecture summary",
    segments: [{ startMs: 0, endMs: 500, description: "Opening" }],
    usage: { promptTokens: 5 },
  });
});

test("rejects empty or invalid audio timelines", () => {
  expect(
    sourceAudioAnalysisSchema.safeParse({
      schemaVersion: 1,
      kind: "audio",
      format: "mp3",
      summary: "Summary",
      segments: [],
      usage: {},
    }).success,
  ).toBe(false);
});

test.each([
  "mp4",
  "mov",
  "mkv",
  "avi",
  "flv",
  "wmv",
] as const)("builds and validates a versioned %s video result", (format) => {
  expect(
    sourceVideoAnalysis(format, {
      summary: "Lecture recording",
      segments: [{ startMs: 0, endMs: 1500, description: "Opening slide" }],
      usage: { completionTokens: 7 },
    }),
  ).toEqual({
    schemaVersion: 1,
    kind: "video",
    format,
    summary: "Lecture recording",
    segments: [{ startMs: 0, endMs: 1500, description: "Opening slide" }],
    usage: { completionTokens: 7 },
  });
});

test("rejects empty or unknown video results", () => {
  expect(
    sourceVideoAnalysisSchema.safeParse({
      schemaVersion: 1,
      kind: "video",
      format: "mp4",
      summary: "Summary",
      segments: [],
      usage: {},
    }).success,
  ).toBe(false);
  expect(
    sourceVideoAnalysisSchema.safeParse({
      schemaVersion: 1,
      kind: "video",
      format: "webm",
      summary: "Summary",
      segments: [{ startMs: 0, endMs: 1, description: "Scene" }],
      usage: {},
    }).success,
  ).toBe(false);
});
