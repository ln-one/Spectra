import { expect, test, vi } from "vitest";
import { workerLogger } from "@/observability/server";
import { logPresentationProgressEvents } from "./progress.server";

const logContext = {
  artifactId: "artifact-1",
  artifactKind: "presentation",
  attemptId: "attempt-1",
  component: "artifact-authoring" as const,
  providerConversationId: "conversation-1",
  workflowId: "workflow-1",
};

test("does not let a logger failure interrupt presentation generation", () => {
  const info = vi.spyOn(workerLogger, "info").mockImplementationOnce(() => {
    throw new Error("logger_unavailable");
  });

  expect(
    logPresentationProgressEvents({
      events: [
        {
          id: "progress-observation",
          kind: "ObservationEvent",
          observation: {
            text: 'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"outline","status":"completed","durationMs":42}',
          },
          source: "environment",
        },
      ],
      logContext,
      seenProgressIds: [],
    }),
  ).toEqual({
    condensationCount: 0,
    progressEvents: [
      {
        durationMs: 42,
        phase: "outline",
        status: "completed",
        version: 1,
      },
    ],
    seenProgressIds: ["progress-observation:0"],
  });

  info.mockRestore();
});

test("logs each condensation without logging its summary", () => {
  const info = vi.spyOn(workerLogger, "info").mockImplementation(() => undefined);
  const result = logPresentationProgressEvents({
    events: [
      {
        forgotten_event_ids: ["event-1", "event-2"],
        id: "condensation-1",
        kind: "Condensation",
        summary: "private model summary",
      },
    ],
    logContext,
    seenProgressIds: [],
  });

  expect(result).toEqual({
    condensationCount: 1,
    progressEvents: [],
    seenProgressIds: ["condensation:condensation-1"],
  });
  expect(info).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "artifact.authoring.condensation_observed",
      forgottenEventCount: 2,
    }),
    expect.any(String),
  );
  expect(JSON.stringify(info.mock.calls)).not.toContain("private model summary");
  info.mockRestore();
});
