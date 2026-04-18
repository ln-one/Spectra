import { fireEvent, render, screen } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/game/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend interactive game HTML.",
    supportsChatRefine: true,
    onRefine: jest.fn(),
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
      contentKind: "text",
      content: JSON.stringify({
        kind: "interactive_game",
        title: "电路术语配对",
        summary: "把关键术语和定义快速配对。",
        game_pattern: "term_pairing",
        html: "<html><body><main><h1>demo</h1></main></body></html>",
      }),
    },
    ...overrides,
  };
}

describe("studio game preview", () => {
  it("renders real game html with pattern summary and refine actions", () => {
    const onRefine = jest.fn();
    const onExportArtifact = jest.fn();

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({ onRefine, onExportArtifact })}
      />
    );

    expect(screen.getByText("互动游戏预览")).toBeInTheDocument();
    expect(screen.getByText("玩法：术语配对")).toBeInTheDocument();
    expect(screen.getByText("电路术语配对")).toBeInTheDocument();
    expect(screen.getByText("把关键术语和定义快速配对。")).toBeInTheDocument();
    expect(screen.getByTitle("backend-game-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "继续微调玩法" }));
    fireEvent.click(screen.getByRole("button", { name: "导出当前成果" }));

    expect(onRefine).toHaveBeenCalledTimes(1);
    expect(onExportArtifact).toHaveBeenCalledWith("game-artifact-1");
  });
});
