import {
  mapSessionsToHistory,
  resolveReusableGenerationSessionId,
} from "@/stores/project-store/generation-actions.helpers";

describe("resolveReusableGenerationSessionId", () => {
  it("reuses the active session when the current session is still reusable", () => {
    expect(
      resolveReusableGenerationSessionId("sess-1", {
        session: {
          session_id: "sess-1",
          project_id: "proj-1",
          output_type: "ppt",
          state: "IDLE",
          created_at: "2026-03-21T00:00:00.000Z",
          updated_at: "2026-03-21T00:00:00.000Z",
          schema_version: 1,
          contract_version: "2026-03",
        },
      } as never)
    ).toBe("sess-1");
  });

  it("keeps generation bound to the active interaction session", () => {
    expect(
      resolveReusableGenerationSessionId("sess-1", {
        session: {
          session_id: "sess-1",
          project_id: "proj-1",
          output_type: "ppt",
          state: "SUCCESS",
          created_at: "2026-03-21T00:00:00.000Z",
          updated_at: "2026-03-21T00:00:00.000Z",
          schema_version: 1,
          contract_version: "2026-03",
        },
      } as never)
    ).toBe("sess-1");
  });
});

describe("mapSessionsToHistory", () => {
  it("keeps idle bootstrap sessions in history instead of dropping them", () => {
    const history = mapSessionsToHistory([
      {
        session_id: "sess-bootstrap",
        state: "IDLE",
        output_type: "both",
        created_at: "2026-03-21T00:00:00.000Z",
      },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("sess-bootstrap");
    expect(history[0].status).toBe("pending");
  });
});
