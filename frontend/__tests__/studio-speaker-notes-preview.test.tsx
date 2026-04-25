import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewStep } from "@/components/project/features/studio/tools/speaker-notes/PreviewStep";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded structured speaker notes artifact.",
    resolvedArtifact: {
      artifactId: "artifact-speaker-1",
      artifactType: "summary",
      contentKind: "json",
      content: {
        kind: "speaker_notes",
        summary: "已生成 1 页逐页说课讲稿。",
        source_binding: { status: "bound" },
        provenance: { created_from_artifact_ids: ["ppt-artifact-1"] },
        slides: [
          {
            id: "slide-1",
            page: 1,
            title: "开场引入",
            sections: [
              {
                id: "slide-1-section-1",
                title: "讲稿正文",
                paragraphs: [
                  {
                    id: "slide-1-paragraph-1",
                    anchor_id: "speaker_notes:v2:slide-1:paragraph-1",
                    text: "今天我们围绕牛顿第二定律展开。",
                    role: "script",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    latestArtifacts: [],
    ...overrides,
  };
}

describe("speaker notes preview", () => {
  it("renders structured speaker notes surface", () => {
    render(
      <PreviewStep
        activePage={1}
        lastGeneratedAt={null}
        highlightTransition={false}
        sourceSlides={[]}
        flowContext={buildFlowContext()}
        onSelectPage={() => undefined}
      />
    );

    expect(screen.getByText("段落锚点")).toBeInTheDocument();
    expect(
      screen.getAllByText("今天我们围绕牛顿第二定律展开。").length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("讲稿备注").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("提词器式讲稿工作面")).toBeInTheDocument();
    expect(screen.getByText("Document substrate")).toBeInTheDocument();
    expect(screen.getByText("从 ppt-artifact-1 延展为讲稿备注")).toBeInTheDocument();
    expect(screen.getByText("提词器视图")).toBeInTheDocument();
    expect(screen.getByText("当前说课焦点")).toBeInTheDocument();
  });

  it("submits structured refine with explicit selection anchor", async () => {
    const onStructuredRefineArtifact = jest.fn().mockResolvedValue({
      ok: true,
      artifactId: "artifact-speaker-2",
      effectiveSessionId: "session-1",
    });

    render(
      <PreviewStep
        activePage={1}
        lastGeneratedAt={null}
        highlightTransition={false}
        sourceSlides={[]}
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        onSelectPage={() => undefined}
      />
    );

    fireEvent.click(screen.getAllByText("今天我们围绕牛顿第二定律展开。")[0]);
    fireEvent.change(
      screen.getByPlaceholderText("编辑当前讲稿片段，保存后会以段落锚点回写新版本。"),
      {
        target: { value: "今天我们围绕牛顿第二定律和质量展开。" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "保存当前片段" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith({
        artifactId: "artifact-speaker-1",
        message: "今天我们围绕牛顿第二定律和质量展开。",
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "paragraph",
          anchor_id: "speaker_notes:v2:slide-1:paragraph-1",
          artifact_id: "artifact-speaker-1",
          label: "开场引入 / script",
        },
        config: {
          active_page: 1,
          highlight_transition: false,
        },
      });
    });
  });
});
