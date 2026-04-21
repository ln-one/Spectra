import { render, waitFor } from "@testing-library/react";
import { fireEvent, screen } from "@testing-library/react";
import { AnimationToolPanel } from "@/components/project/features/studio/tools/AnimationToolPanel";

jest.mock(
  "@/components/project/features/studio/tools/useStudioRagRecommendations",
  () => ({
    useStudioRagRecommendations: () => ({
      suggestions: [],
      isLoading: false,
    }),
  })
);

describe("AnimationToolPanel defaults", () => {
  test("promotes bubble sort requests to gif mock mode without changing animation duration", async () => {
    const onDraftChange = jest.fn();

    render(
      <AnimationToolPanel
        toolId="animation"
        toolName="演示动画"
        onDraftChange={onDraftChange}
        flowContext={
          {
            managedWorkbenchMode: "draft",
            currentDraft: {
              topic: "冒泡排序",
              animation_format: "gif",
              render_mode: "gif",
            },
            latestArtifacts: [],
            sourceOptions: [],
            selectedSourceId: null,
            canExecute: true,
            isLoadingProtocol: false,
            readiness: "ready",
          } as never
        }
      />
    );

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenCalled();
    });

    const latestPayload = onDraftChange.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(latestPayload?.animation_format).toBe("gif");
    expect(latestPayload?.render_mode).toBe("gif");
    expect(latestPayload?.duration_seconds).toBe(6);
  });

  test("keeps non-bubble topics on html5 by default", async () => {
    const onDraftChange = jest.fn();

    render(
      <AnimationToolPanel
        toolId="animation"
        toolName="演示动画"
        onDraftChange={onDraftChange}
        flowContext={
          {
            managedWorkbenchMode: "draft",
            currentDraft: {
              topic: "快速演示光合作用过程",
              animation_format: "gif",
              render_mode: "gif",
            },
            latestArtifacts: [],
            sourceOptions: [],
            selectedSourceId: null,
            canExecute: true,
            isLoadingProtocol: false,
            readiness: "ready",
          } as never
        }
      />
    );

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenCalled();
    });

    const latestPayload = onDraftChange.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(latestPayload?.animation_format).toBe("html5");
    expect(latestPayload?.render_mode).toBe("html5");
  });

  test("uses the local bubble sort route without preparing backend execution", async () => {
    const onPreviewExecution = jest.fn();
    const onPrepareGenerate = jest.fn();
    const onExecute = jest.fn().mockResolvedValue(true);

    render(
      <AnimationToolPanel
        toolId="animation"
        toolName="演示动画"
        flowContext={
          {
            managedWorkbenchMode: "draft",
            currentDraft: {
              topic: "演示冒泡排序全过程",
            },
            latestArtifacts: [],
            sourceOptions: [],
            selectedSourceId: null,
            canExecute: true,
            isLoadingProtocol: false,
            readiness: "ready",
            onPreviewExecution,
            onPrepareGenerate,
            onExecute,
          } as never
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "生成演示动画" }));

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
    expect(onPreviewExecution).not.toHaveBeenCalled();
    expect(onPrepareGenerate).not.toHaveBeenCalled();
  });
});
