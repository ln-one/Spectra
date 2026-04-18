import { fireEvent, render, screen } from "@testing-library/react";
import { GenerateStep } from "@/components/project/features/studio/tools/animation/GenerateStep";

describe("studio animation generate step", () => {
  const baseProps = {
    topic: "冒泡排序",
    focus: "突出比较和交换过程",
    durationSeconds: 6,
    animationFormat: "mp4" as const,
    rhythm: "balanced" as const,
    stylePack: "teaching_ppt_cartoon" as const,
    visualType: null,
    serverSpecPreview: null,
    serverSpecCandidates: [],
    specConfidence: null,
    needsUserChoice: false,
    flowContext: {
      selectedSourceId: null,
      sourceOptions: [],
      canExecute: true,
    },
    isGenerating: false,
    onDurationChange: jest.fn(),
    onAnimationFormatChange: jest.fn(),
    onRhythmChange: jest.fn(),
    onStylePackChange: jest.fn(),
    onVisualTypeChange: jest.fn(),
    onBack: jest.fn(),
    onGenerate: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("shows export-only guidance for mp4 output", () => {
    render(<GenerateStep {...baseProps} />);

    expect(screen.getByText("正式输出：MP4")).toBeInTheDocument();
    expect(
      screen.getByText("本次生成后可导出 MP4，但不可直接 placement")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "按规格生成 MP4 动画" })
    ).toBeInTheDocument();
  });

  test("shows placement-ready guidance for gif output", () => {
    render(
      <GenerateStep
        {...baseProps}
        animationFormat="gif"
        serverSpecPreview={{
          render_mode: "gif",
          artifact_type: "gif",
          placement_supported: true,
          placement_prerequisites: ["bind_ppt_artifact"],
        }}
      />
    );

    expect(screen.getByText("正式输出：GIF")).toBeInTheDocument();
    expect(screen.getByText("本次生成后可进入 PPT placement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按规格生成 GIF 动画" })).toBeInTheDocument();
  });

  test("passes output format changes through the selector", () => {
    render(<GenerateStep {...baseProps} />);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByText("GIF（支持后续 placement）"));

    expect(baseProps.onAnimationFormatChange).toHaveBeenCalledWith("gif");
  });
});
