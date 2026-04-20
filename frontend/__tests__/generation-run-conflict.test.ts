import { ApiError } from "@/lib/sdk/errors";
import {
  isSessionRunActive,
  parseActiveRunConflict,
} from "@/lib/project/generation-run-conflict";

describe("generation run conflict helpers", () => {
  it("parses active run context from 409 ApiError details", () => {
    const error = new ApiError("RESOURCE_CONFLICT", "conflict", 409, {
      run_id: "run-123",
      run_status: "RUNNING",
      run_step: "outline",
      run: {
        session_id: "session-abc",
      },
    });

    expect(parseActiveRunConflict(error)).toEqual({
      runId: "run-123",
      sessionId: "session-abc",
      runStatus: "RUNNING",
      runStep: "outline",
    });
  });

  it("parses conflict from 409 message hint even without run details", () => {
    const error = new ApiError(
      "RESOURCE_CONFLICT",
      "当前会话已有进行中的 Run，请继续该 Run",
      409
    );
    const parsed = parseActiveRunConflict(error);

    expect(parsed).not.toBeNull();
    expect(parsed?.runId).toBeNull();
    expect(parsed?.sessionId).toBeNull();
  });

  it("ignores non-conflict errors", () => {
    const error = new ApiError("BAD_REQUEST", "invalid input", 400, {
      run_id: "run-123",
    });
    expect(parseActiveRunConflict(error)).toBeNull();
  });

  it("recognizes active and terminal session states", () => {
    expect(isSessionRunActive("AWAITING_REQUIREMENTS_CONFIRM")).toBe(true);
    expect(isSessionRunActive("DRAFTING_OUTLINE")).toBe(true);
    expect(isSessionRunActive("RENDERING")).toBe(true);
    expect(isSessionRunActive("SUCCESS")).toBe(false);
    expect(isSessionRunActive("FAILED")).toBe(false);
  });
});
