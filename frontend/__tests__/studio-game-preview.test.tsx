import { fireEvent, render, screen } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/game/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "protocol_limited",
    capabilityReason:
      "Loaded backend interactive game HTML through legacy compatibility zone.",
    cardCapability: {
      id: "interactive_games",
      title: "互动游戏",
      readiness: "foundation_ready",
      governance_tag: "freeze",
      cleanup_priority: "p0",
      surface_strategy: "freeze_then_runtime_replacement",
      frozen: true,
      health_report: {
        authority_integrity: 2,
        builder_thinness: 1,
        surface_maturity: 2,
        fallback_residue: 1,
        test_coverage: 2,
        replaceability: 5,
        summary: "立即冻结模板/patch/fallback 扩张，后续只允许替换为真正的 sandbox runtime 方案。",
      },
      context_mode: "hybrid",
      execution_mode: "artifact_create",
      primary_capabilities: [],
      related_capabilities: [],
      artifact_types: [],
      requires_source_artifact: false,
      supports_chat_refine: true,
      supports_selection_context: false,
      config_fields: [],
      actions: [],
    },
    supportsChatRefine: false,
    onStructuredRefineArtifact: jest.fn().mockResolvedValue({ ok: true }),
    onExportArtifact: jest.fn(),
    latestArtifacts: [
      {
        artifactId: "game-artifact-1",
        title: "电路术语配对",
        status: "completed",
        createdAt: "2026-04-17T08:00:00.000Z",
      },
    ],
    resolvedArtifact: {
      artifactId: "game-artifact-1",
      artifactType: "html",
      contentKind: "json",
      content: {
        kind: "interactive_game",
        title: "电路术语配对",
        summary: "把关键术语和定义快速配对。",
        game_pattern: "term_pairing",
        html: "<html><body><main><h1>demo</h1></main></body></html>",
        compatibility_zone: {
          status: "protocol_limited",
          zone: "interactive_games_legacy_compatibility",
        },
      },
    },
    ...overrides,
  };
}

describe("studio game preview", () => {
  it("renders real game html with pattern summary and refine actions", () => {
    const onStructuredRefineArtifact = jest
      .fn()
      .mockResolvedValue({ ok: true });
    const onExportArtifact = jest.fn();

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({
          onStructuredRefineArtifact,
          onExportArtifact,
        })}
      />
    );

    expect(screen.getByText("互动游戏工作面")).toBeInTheDocument();
    expect(screen.getByText("玩法：术语配对")).toBeInTheDocument();
    expect(screen.getAllByText("电路术语配对").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("把关键术语和定义快速配对。").length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("治理：冻结 · 清理优先级：P0")).toBeInTheDocument();
    expect(screen.getByText("协议尚未闭环")).toBeInTheDocument();
    expect(
      screen.getByText("当前建议动作：当前结果来自冻结兼容区，只允许试玩、导出或走正式 replacement refine。")
    ).toBeInTheDocument();
    expect(screen.getByTitle("backend-game-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "提交正式 Rewrite" }));
    fireEvent.click(screen.getByRole("button", { name: "导出当前成果" }));

    expect(onStructuredRefineArtifact).toHaveBeenCalledTimes(1);
    expect(onExportArtifact).toHaveBeenCalledWith("game-artifact-1");
  });

  it("shows empty state when backend did not return real html", () => {
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
              title: "空结果",
              summary: "后端暂未返回 html。",
              game_pattern: "term_pairing",
              html: "",
              compatibility_zone: {
                status: "protocol_limited",
                zone: "interactive_games_legacy_compatibility",
              },
            },
          },
        })}
      />
    );

    expect(screen.getByText("暂未收到后端真实游戏")).toBeInTheDocument();
    expect(screen.queryByTitle("backend-game-preview")).not.toBeInTheDocument();
  });
});
