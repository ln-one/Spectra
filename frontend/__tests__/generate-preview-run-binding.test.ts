import { resolveActivePreviewRunId } from "@/app/projects/[id]/generate/_views/useGeneratePreviewState";

describe("resolveActivePreviewRunId", () => {
  it("does not reuse a store run from another session", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-b",
        runIdFromQuery: null,
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: {
          session: { session_id: "session-a" },
          current_run: { run_id: "run-a" },
        },
      })
    ).toBeNull();
  });

  it("keeps the current session run when store session matches", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-a",
        runIdFromQuery: null,
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: null,
      })
    ).toBe("run-a");
  });

  it("prefers the explicit query run id", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-b",
        runIdFromQuery: "run-from-url",
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: null,
      })
    ).toBe("run-from-url");
  });
});
