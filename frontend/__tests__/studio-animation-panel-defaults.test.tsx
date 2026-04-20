import { render, waitFor } from "@testing-library/react";
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
  test("forces html5 output by default even when persisted draft format is gif", async () => {
    const onDraftChange = jest.fn();

    render(
      <AnimationToolPanel
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
    expect(latestPayload?.animation_format).toBe("html5");
    expect(latestPayload?.render_mode).toBe("html5");
  });
});

