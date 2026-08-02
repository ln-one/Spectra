import { expect, test } from "vitest";
import { parsePresentationProgressEvents } from "./progress";

function observation(text: string) {
  return {
    id: "observation-1",
    kind: "ObservationEvent",
    observation: { content: [{ text }] },
    source: "environment",
  };
}

function hookExecution(stdout: string, overrides: Record<string, unknown> = {}) {
  return {
    hook_event_type: "PostToolUse",
    id: "hook-1",
    kind: "HookExecutionEvent",
    source: "hook",
    stdout,
    tool_name: "file_editor",
    ...overrides,
  };
}

test("parses only validated presentation progress markers from observations", () => {
  const events = [
    observation(
      [
        "checker output that must not be logged",
        'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"visual_check","status":"completed","operation":"check","iteration":2,"durationMs":930,"issues":{"boundsOutside":1,"textOverflow":22,"overlap":3}}',
      ].join("\n"),
    ),
  ];

  expect(parsePresentationProgressEvents(events)).toEqual([
    {
      observationEventId: "observation-1",
      progressId: "observation-1:0",
      progress: {
        durationMs: 930,
        issues: { boundsOutside: 1, overlap: 3, textOverflow: 22 },
        iteration: 2,
        operation: "check",
        phase: "visual_check",
        status: "completed",
        version: 1,
      },
    },
  ]);
});

test("ignores agent messages, malformed payloads, and unapproved fields", () => {
  const payload =
    'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"outline","status":"completed","thought":"secret"}';
  expect(
    parsePresentationProgressEvents([
      { ...observation(payload), kind: "MessageEvent", source: "agent" },
      observation("SPECTRA_PPT_PROGRESS_V1 not-json"),
      observation(payload),
    ]),
  ).toEqual([]);
});

test("rejects invalid page and failure progress", () => {
  expect(
    parsePresentationProgressEvents([
      observation(
        [
          'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"pptd","status":"progress","operation":"generated","pageNumber":7,"totalPages":6}',
          'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"screenshot","status":"failed","operation":"render"}',
        ].join("\n"),
      ),
    ]),
  ).toEqual([]);
});

test("parses page progress markers from PostToolUse hook execution stdout", () => {
  const events = [
    hookExecution(
      'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"pptd","status":"progress","operation":"generated","pagePath":"pages/cover.page"}\n',
    ),
  ];

  expect(parsePresentationProgressEvents(events)).toEqual([
    {
      observationEventId: "hook-1",
      progressId: "hook-1:0",
      progress: {
        operation: "generated",
        pagePath: "pages/cover.page",
        phase: "pptd",
        status: "progress",
        version: 1,
      },
    },
  ]);
});

test("ignores hook executions that are not PostToolUse file edits", () => {
  const stdout =
    'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"pptd","status":"progress","operation":"generated","pagePath":"pages/cover.page"}';
  expect(
    parsePresentationProgressEvents([
      hookExecution(stdout, { hook_event_type: "Stop" }),
      hookExecution(stdout, { source: "environment" }),
      hookExecution(stdout, { stdout: 42 }),
    ]),
  ).toEqual([]);
});
