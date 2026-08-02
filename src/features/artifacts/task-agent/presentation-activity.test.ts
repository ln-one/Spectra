import { expect, test } from "vitest";
import {
  latestPresentationAgentActivityAt,
  PRESENTATION_AGENT_STALL_TIMEOUT_MS,
  presentationAgentStalled,
} from "./presentation-activity";

const startedAt = Date.parse("2026-07-29T14:00:00.000Z");

test("records agent actions, messages, and validated presentation progress as activity", () => {
  expect(
    latestPresentationAgentActivityAt([
      {
        id: "agent-action",
        kind: "ActionEvent",
        source: "agent",
        timestamp: "2026-07-29T14:01:00.000Z",
      },
      {
        id: "progress",
        kind: "ObservationEvent",
        observation: {
          text: 'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"pptd","status":"progress"}',
        },
        source: "environment",
        timestamp: "2026-07-29T14:02:00.000Z",
      },
      {
        id: "environment-only",
        kind: "ObservationEvent",
        observation: { text: "not a progress marker" },
        source: "environment",
        timestamp: "2026-07-29T14:03:00.000Z",
      },
    ]),
  ).toBe(Date.parse("2026-07-29T14:02:00.000Z"));
});

test("treats timezone-less OpenHands event timestamps as UTC", () => {
  expect(
    latestPresentationAgentActivityAt([
      {
        id: "agent-action",
        kind: "ActionEvent",
        source: "agent",
        timestamp: "2026-07-30T17:03:35.781295",
      },
    ]),
  ).toBe(Date.parse("2026-07-30T17:03:35.781295Z"));
});

test("does not mark stale or malformed events as activity", () => {
  expect(
    latestPresentationAgentActivityAt([
      {
        id: "invalid-progress",
        kind: "ObservationEvent",
        observation: {
          text: 'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"pptd","status":"progress","unknown":true}',
        },
        source: "environment",
        timestamp: "2026-07-29T14:02:00.000Z",
      },
      {
        id: "agent-without-time",
        kind: "ActionEvent",
        source: "agent",
      },
    ]),
  ).toBeNull();
});

test("stalls after five minutes without activity", () => {
  expect(
    presentationAgentStalled(
      startedAt,
      startedAt + PRESENTATION_AGENT_STALL_TIMEOUT_MS - 1,
      "idle",
    ),
  ).toBe(false);
  expect(
    presentationAgentStalled(startedAt, startedAt + PRESENTATION_AGENT_STALL_TIMEOUT_MS, "idle"),
  ).toBe(true);
});

test("does not interrupt a running agent while an LLM request is in flight", () => {
  expect(
    presentationAgentStalled(
      startedAt,
      startedAt + 2 * PRESENTATION_AGENT_STALL_TIMEOUT_MS,
      "running",
    ),
  ).toBe(false);
});
