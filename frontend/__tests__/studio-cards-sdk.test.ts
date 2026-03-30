import { ApiError } from "@/lib/sdk/client";
import { studioCardsApi } from "@/lib/sdk/studio-cards";

describe("studio cards sdk", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("gets execution plan with typed readiness", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: {
            execution_plan: {
              card_id: "interactive_games",
              readiness: "foundation_ready",
              initial_binding: {
                endpoint:
                  "/api/v1/generate/studio-cards/interactive_games/execute",
                command: "execute",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const result = await studioCardsApi.getExecutionPlan("interactive_games");
    expect(result.data.execution_plan.readiness).toBe("foundation_ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/interactive_games/execution-plan"
    );
  });

  test("throws ApiError when execute returns non-2xx", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CARD_NOT_READY",
            message: "card not ready",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    await expect(
      studioCardsApi.execute("word_document", { project_id: "proj_1" })
    ).rejects.toBeInstanceOf(ApiError);
  });

  test("posts simulator turn payload", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: {
            artifact: { id: "a-next" },
            turn_result: {
              turn_anchor: "turn-2",
              student_profile: "detail_oriented",
              student_question: "为什么这里不能直接套公式？",
              teacher_answer: "先看边界条件。",
              feedback: "可以再补一步推导。",
              score: 82,
              next_focus: "受力分解",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const result = await studioCardsApi.turn({
      project_id: "proj_1",
      artifact_id: "artifact_1",
      teacher_answer: "先看边界条件。",
      rag_source_ids: ["file-1"],
    });

    expect(result.data.turn_result.turn_anchor).toBe("turn-2");
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/classroom_qa_simulator/turn"
    );
  });

  test("posts structured refine payload", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: {
            execution_result: {
              resource_kind: "artifact",
              artifact: { id: "a-2" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const result = await studioCardsApi.refineArtifact("speaker_notes", {
      project_id: "proj_1",
      artifact_id: "artifact_1",
      message: "改一下第 3 页过渡语",
      config: { selected_script_segment: "slide-3:transition" },
    });

    const artifact = result.data.execution_result.artifact as {
      id?: string;
    };
    expect(artifact.id).toBe("a-2");
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/speaker_notes/refine"
    );
  });
});
