import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { STUDIO_STATE_TONES } from "@/components/project/features/studio/state-tones";
import { WorkbenchCenteredState } from "@/components/project/features/studio/tools/WorkbenchCenteredState";

describe("WorkbenchCenteredState", () => {
  it("renders centered variant with icon and pill", () => {
    render(
      <WorkbenchCenteredState
        tone="sky"
        icon={FileText}
        title="文档生成中"
        description="正在整理文档内容。"
        pill="工作台正在准备中"
      />
    );

    expect(screen.getByText("文档生成中")).toBeInTheDocument();
    expect(screen.getByText("工作台正在准备中")).toBeInTheDocument();
  });

  it("renders compact variant", () => {
    render(
      <WorkbenchCenteredState
        tone="teal"
        variant="compact"
        icon={FileText}
        title="导图同步中"
        description="界面将优先显示最新内容。"
      />
    );

    expect(screen.getByText("导图同步中")).toBeInTheDocument();
  });

  it("uses loading state instead of rendering the provided icon", () => {
    const { container } = render(
      <WorkbenchCenteredState
        tone="violet"
        loading
        icon={FileText}
        title="小测生成中"
        description="正在整理题目。"
      />
    );

    expect(screen.getByText("小测生成中")).toBeInTheDocument();
    expect(container.querySelector(".lucide-loader-circle")).toBeTruthy();
    expect(container.querySelector(".lucide-file-text")).toBeFalsy();
  });

  it("exposes stable tone token mappings", () => {
    expect(STUDIO_STATE_TONES.sky.icon).toBe("#0ea5e9");
    expect(STUDIO_STATE_TONES.teal.border).toBe("#99f6e4");
    expect(STUDIO_STATE_TONES.emerald.title).toBe("#052e16");
  });
});
