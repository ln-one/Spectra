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
              follow_up_turn_binding: {
                endpoint:
                  "/api/v1/generate/studio-cards/classroom_qa_simulator/turn",
                command: "turn",
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
    expect(result.data.execution_plan.follow_up_turn_binding?.endpoint).toContain(
      "classroom_qa_simulator/turn"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/interactive_games/execution-plan"
    );
  });

  test("preserves animation contract metadata from card and execution plan", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: "ok",
            data: {
              studio_card: {
                id: "demonstration_animations",
                title: "演示动画",
                readiness: "foundation_ready",
                context_mode: "artifact",
                execution_mode: "artifact_create",
                requires_source_artifact: false,
                supports_chat_refine: true,
                supports_selection_context: true,
                actions: [],
                governance_tag: "separate-track",
                cleanup_priority: "p1",
                surface_strategy: "separate_runtime_track",
                render_contract: "storyboard_render_contract",
                placement_supported: true,
                runtime_preview_mode: "local_preview_only",
                cloud_render_mode: "async_media_export",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: "ok",
            data: {
              execution_plan: {
                card_id: "demonstration_animations",
                readiness: "foundation_ready",
                initial_binding: {
                  endpoint:
                    "/api/v1/projects/{project_id}/artifacts",
                },
                refine_binding: {
                  endpoint:
                    "/api/v1/generate/studio-cards/{card_id}/refine",
                },
                source_binding: {
                  endpoint:
                    "/api/v1/generate/studio-cards/{card_id}/sources",
                },
                placement_binding: {
                  endpoint:
                    "/api/v1/generate/studio-cards/{card_id}/confirm-placement",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    global.fetch = fetchMock as typeof global.fetch;

    const card = await studioCardsApi.getCard("demonstration_animations");
    const plan = await studioCardsApi.getExecutionPlan("demonstration_animations");

    expect(card.data.studio_card.render_contract).toBe(
      "storyboard_render_contract"
    );
    expect(card.data.studio_card.placement_supported).toBe(true);
    expect(plan.data.execution_plan.placement_binding?.endpoint).toContain(
      "confirm-placement"
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
            latest_runnable_state: {
              primary_carrier: "hybrid",
              next_action: "follow_up_turn",
            },
            turn_anchor: "turn-2",
            next_focus: "受力分解",
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
    expect(result.data.latest_runnable_state?.next_action).toBe("follow_up_turn");
    expect(result.data.turn_anchor).toBe("turn-2");
    expect(result.data.next_focus).toBe("受力分解");
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

  test("passes session_id when loading source artifacts", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: { sources: [] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    await studioCardsApi.getSources(
      "demonstration_animations",
      "proj_1",
      "sess_1"
    );

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/demonstration_animations/sources"
    );
    expect(request.url).toContain("project_id=proj_1");
    expect(request.url).toContain("session_id=sess_1");
  });

  test("keeps ppt_artifact payload when confirming animation placement", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: {
            placements: [{ page_number: 2, slot: "right-panel" }],
            artifact: { id: "gif_1" },
            ppt_artifact: {
              id: "ppt_1",
              session_id: "sess_1",
              updated_at: "2026-04-11T10:00:00.000Z",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const result = await studioCardsApi.confirmAnimationPlacement({
      project_id: "proj_1",
      artifact_id: "gif_1",
      ppt_artifact_id: "ppt_1",
      page_numbers: [2],
      slot: "right-panel",
    });

    expect(result.data.ppt_artifact?.id).toBe("ppt_1");
    expect(result.data.ppt_artifact?.session_id).toBe("sess_1");
  });
});
