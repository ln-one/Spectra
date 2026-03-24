import { render, screen } from "@testing-library/react";
import {
  CapabilityNotice,
  FallbackPreviewHint,
} from "@/components/project/features/studio/tools/CapabilityNotice";

describe("CapabilityNotice", () => {
  it("renders each backend status label", () => {
    render(<CapabilityNotice status="backend_ready" reason="ok" />);
    expect(screen.getByText("后端真实内容")).toBeInTheDocument();

    render(
      <CapabilityNotice status="backend_placeholder" reason="placeholder" />
    );
    expect(screen.getByText("后端等待中")).toBeInTheDocument();

    render(
      <CapabilityNotice
        status="backend_not_implemented"
        reason="not implemented"
      />
    );
    expect(screen.getByText("后端暂未实现")).toBeInTheDocument();

    render(<CapabilityNotice status="backend_error" reason="error" />);
    expect(screen.getByText("后端解析失败")).toBeInTheDocument();
  });

  it("renders fallback preview hint text", () => {
    render(<FallbackPreviewHint />);
    expect(screen.getByText("正在等待后端返回真实内容")).toBeInTheDocument();
  });
});
