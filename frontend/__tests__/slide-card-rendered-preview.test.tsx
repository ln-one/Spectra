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
  it("prefers rendered page image when thumbnail_url is available", () => {
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
      />
    );

    const image = screen.getByRole("img", { name: "真实预览" });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "data:image/png;base64,abc");
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

  it("renders html preview when no image thumbnail is available", () => {
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

    expect(screen.getByText("HTML preview body")).toBeInTheDocument();
    expect(screen.queryByText("markdown fallback")).not.toBeInTheDocument();
  });
});
