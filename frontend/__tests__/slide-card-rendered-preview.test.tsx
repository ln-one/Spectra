import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlideCard } from "@/app/projects/[id]/generate/_views/SlideCard";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

describe("SlideCard rendered preview", () => {
  it("prefers rendered image preview over html preview when both are available", () => {
    render(
      <SlideCard
        slide={{
          id: "slide-1",
          index: 0,
          title: "真实预览",
          content: "# markdown fallback",
          sources: [],
          thumbnail_url: "data:image/png;base64,abc",
          rendered_html_preview:
            "<section><h1>真实预览</h1><p>HTML 不应作为主预览</p></section>",
        }}
        isActive
      />
    );

    expect(screen.getByRole("img", { name: "真实预览" })).toHaveAttribute(
      "src",
      "data:image/png;base64,abc"
    );
    expect(screen.queryByTitle("真实预览")).not.toBeInTheDocument();
    expect(screen.queryByText("markdown fallback")).not.toBeInTheDocument();
  });

  it("shows modify action on the active rendered slide", () => {
    const handleModify = jest.fn();

    render(
      <SlideCard
        slide={{
          id: "slide-1",
          index: 0,
          title: "真实预览",
          content: "# markdown fallback",
          sources: [],
          thumbnail_url: "data:image/png;base64,abc",
        }}
        isActive
        onModify={handleModify}
      />
    );

    const button = screen.getByRole("button", { name: "修改当前页" });
    fireEvent.click(button);

    expect(handleModify).toHaveBeenCalledTimes(1);
  });

  it("shows image-generating state when only html preview is available", () => {
    render(
      <SlideCard
        slide={{
          id: "slide-2",
          index: 1,
          title: "结构预览",
          content: "# markdown fallback",
          sources: [],
          rendered_html_preview:
            "<section><h1>结构预览</h1><p>HTML preview body</p></section>",
        }}
        isActive
      />
    );

    expect(screen.queryByTitle("结构预览")).not.toBeInTheDocument();
    expect(screen.getByText("预览图片生成中")).toBeInTheDocument();
    expect(screen.getByText(/等待最终 slide 图片/)).toBeInTheDocument();
    expect(screen.queryByText("markdown fallback")).not.toBeInTheDocument();
  });

  it("shows terminal failed state when html-only preview belongs to a failed run", () => {
    render(
      <SlideCard
        slide={{
          id: "slide-3",
          index: 2,
          title: "失败预览",
          content: "# markdown fallback",
          sources: [],
          rendered_html_preview:
            "<section><h1>失败预览</h1><p>HTML preview body</p></section>",
        }}
        isActive
        isPreviewTerminalFailed
      />
    );

    expect(screen.queryByTitle("失败预览")).not.toBeInTheDocument();
    expect(screen.getByText("预览图片未生成")).toBeInTheDocument();
    expect(screen.getByText(/本次生成已失败/)).toBeInTheDocument();
    expect(screen.queryByText("预览图片生成中")).not.toBeInTheDocument();
  });
});
