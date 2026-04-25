import { fireEvent, render, screen } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/game/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend interactive game runtime.",
    cardCapability: {
      id: "interactive_games",
      title: "互动游戏",
      readiness: "foundation_ready",
      governance_tag: "harden",
      cleanup_priority: "p1",
      surface_strategy: "sandbox_artifact_surface",
      frozen: false,
      health_report: {
        authority_integrity: 4,
        builder_thinness: 4,
        surface_maturity: 4,
        fallback_residue: 4,
        test_coverage: 3,
        replaceability: 4,
        summary:
          "interactive_game.v2 已收口为受控 sandbox runtime 与 artifact rewrite 链。",
      },
      context_mode: "artifact",
      execution_mode: "artifact_create",
      primary_capabilities: [],
      related_capabilities: [],
      artifact_types: [],
      requires_source_artifact: false,
      supports_chat_refine: true,
      supports_selection_context: false,
      actions: [],
      config_fields: [],
    },
    onExportArtifact: jest.fn(),
    latestArtifacts: [
      {
        artifactId: "game-artifact-1",
        title: "电路连线赛",
        status: "completed",
        createdAt: "2026-04-21T08:00:00.000Z",
      },
    ],
    resolvedArtifact: {
      artifactId: "game-artifact-1",
      artifactType: "html",
      contentKind: "json",
      content: {
        kind: "interactive_game",
        schema_id: "interactive_game.v2",
        subtype: "relationship_link",
        title: "电路连线赛",
        summary: "把电路连接方式和对应特征连起来。",
        subtitle: "用连线动作完成电路特征辨认",
        teaching_goal: "区分串联和并联的特征",
        teacher_notes: ["先给学生 15 秒独立判断，再一起核对。"],
        instructions: ["先点左侧概念。", "再点右侧对应特征完成连线。"],
        spec: {
          left_nodes: [{ id: "left-1", label: "串联" }],
          right_nodes: [{ id: "right-1", label: "电流路径唯一" }],
          correct_links: [{ left_id: "left-1", right_id: "right-1" }],
          feedback_copy: {
            correct: "连线正确。",
            incorrect: "还有关系需要调整。",
          },
        },
        score_policy: { max_score: 100, timer_seconds: 90 },
        completion_rule: {
          pass_threshold: 1,
          success_copy: "完成得很漂亮。",
          failure_copy: "再试一次。",
        },
        answer_key: {
          subtype: "relationship_link",
          correct_links: [{ left_id: "left-1", right_id: "right-1" }],
        },
        runtime: {
          html: "<html><body><main><h1>demo</h1></main></body></html>",
          sandbox_version: "interactive_game_sandbox.v1",
          assets: [],
        },
      },
    },
    ...overrides,
  };
}

describe("studio game preview", () => {
  it("renders interactive_game.v2 sandbox with rule and answer dialogs", () => {
    const onExportArtifact = jest.fn();

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-21T08:00:00.000Z"
        flowContext={buildFlowContext({
          onExportArtifact,
        })}
      />
    );

    expect(screen.getByTitle("interactive-game-sandbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看规则" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看答案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看规则" }));
    expect(screen.getByText("规则说明")).toBeInTheDocument();
    expect(screen.getByText("电路连线赛")).toBeInTheDocument();
    expect(screen.getByText("区分串联和并联的特征")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "查看答案" }));
    expect(screen.getByText("标准结构")).toBeInTheDocument();
    expect(screen.getByText(/correct_links/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    expect(onExportArtifact).toHaveBeenCalledWith("game-artifact-1");
  });

  it("shows empty state when sandbox html is missing", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "game-artifact-2",
            artifactType: "html",
            contentKind: "json",
            content: {
              kind: "interactive_game",
              schema_id: "interactive_game.v2",
              subtype: "drag_classification",
              title: "空结果",
              instructions: ["先拖拽。", "再检查答案。"],
              spec: {
                items: [],
                zones: [],
                correct_mapping: {},
              },
              runtime: {
                html: "",
                sandbox_version: "interactive_game_sandbox.v1",
                assets: [],
              },
            },
          },
        })}
      />
    );

    expect(screen.getByText("暂未收到可试玩小游戏")).toBeInTheDocument();
    expect(screen.queryByTitle("interactive-game-sandbox")).not.toBeInTheDocument();
  });
});
