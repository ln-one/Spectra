import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global Tailwind source detection", () => {
  it("only scans application source files", () => {
    const stylesheet = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

    expect(stylesheet).toContain('@import "tailwindcss" source(none);');
    expect(stylesheet).toContain('@source "../";');
  });

  it("keeps workbench-only styles out of the public stylesheet", () => {
    const publicStylesheet = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    const workspaceStylesheet = readFileSync(
      new URL("./styles/workspace.css", import.meta.url),
      "utf8",
    );

    expect(publicStylesheet).not.toContain("@assistant-ui/react-markdown");
    expect(publicStylesheet).not.toContain("survey-core");
    expect(publicStylesheet).not.toContain("@xyflow/react");
    expect(workspaceStylesheet).toContain("@assistant-ui/react-markdown");
    expect(workspaceStylesheet).toContain("@xyflow/react/dist/style.css");
    expect(workspaceStylesheet).toContain("./workspace-theme/common.css");
  });
});
