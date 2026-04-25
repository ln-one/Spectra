import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { StudioPanelHeader } from "@/components/project/features/studio/panel/components/StudioPanelHeader";

describe("StudioPanelHeader", () => {
  it("keeps the studio title visible in collapsed mode", () => {
    render(
      <StudioPanelHeader
        isExpanded={false}
        expandedTool={null}
        onClose={() => undefined}
        currentIcon={Sparkles}
        currentColor={{ primary: "#000000", glow: "rgba(0,0,0,0.1)" }}
      />
    );

    expect(document.body).toHaveTextContent("备课工坊");
    expect(document.body).toHaveTextContent(/AI\s+生成工具/);
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  });
});
