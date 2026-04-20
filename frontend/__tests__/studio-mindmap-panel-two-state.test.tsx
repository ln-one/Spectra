import { act, fireEvent, render, screen } from "@testing-library/react";
import { MindmapToolPanel } from "@/components/project/features/studio/tools/MindmapToolPanel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

jest.mock("@/stores/projectStore", () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      project: { id: "proj-1", name: "计算机网络" },
    }),
}));

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    managedWorkbenchMode: "draft",
    isLoadingProtocol: false,
    isActionRunning: false,
    canExecute: true,
    selectedSourceId: null,
    sourceOptions: [],
    currentDraft: {
      output_requirements: "围绕空闲时间是D构建关键概念关系",
    },
    ...overrides,
  };
}

function createDeferred() {
  let resolve: (value: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mindmap panel two-state workbench", () => {
  it("renders only draft card in draft mode", () => {
    render(
      <MindmapToolPanel
        toolId="mindmap"
        toolName="思维导图"
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("生成要求")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键生成导图" })).toBeInTheDocument();
    expect(screen.queryByText("知识导图")).not.toBeInTheDocument();
  });

  it("switches to result surface while generation is running", async () => {
    const deferred = createDeferred();
    const onExecute = jest.fn().mockReturnValue(deferred.promise);

    render(
      <MindmapToolPanel
        toolId="mindmap"
        toolName="思维导图"
        flowContext={buildFlowContext({
          onPrepareGenerate: () => true,
          onExecute,
        })}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键生成导图" }));
    });

    expect(onExecute).toHaveBeenCalled();
    expect(screen.queryByText("生成要求")).not.toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实导图")).toBeInTheDocument();

    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });
  });

  it("stays in result surface when opening history mode", () => {
    render(
      <MindmapToolPanel
        toolId="mindmap"
        toolName="思维导图"
        flowContext={buildFlowContext({
          managedWorkbenchMode: "history",
        })}
      />
    );

    expect(screen.queryByText("生成要求")).not.toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实导图")).toBeInTheDocument();
  });

  it("stays in result surface when artifact already exists", () => {
    render(
      <MindmapToolPanel
        toolId="mindmap"
        toolName="思维导图"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "mindmap-artifact-1",
            artifactType: "mindmap",
            contentKind: "json",
            content: {
              kind: "mindmap",
              nodes: [
                {
                  id: "root",
                  label: "网络层",
                  children: [],
                },
              ],
            },
          },
        })}
      />
    );

    expect(screen.queryByText("生成要求")).not.toBeInTheDocument();
    expect(screen.getByText("网络层")).toBeInTheDocument();
  });
});
