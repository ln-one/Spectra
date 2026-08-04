import { describe, expect, it } from "vitest";
import { graphViewBasename, graphViewDisplayText, isGraphViewMarkdownPath } from "./display-text";

describe("graphViewDisplayText", () => {
  it("uses the basename and removes the final Markdown extension", () => {
    expect(graphViewDisplayText("docs/design/graph-view.md")).toBe("graph-view");
    expect(graphViewDisplayText("assets/diagram.svg", false)).toBe("diagram.svg");
    expect(graphViewDisplayText("README")).toBe("README");
  });

  it("preserves dotfiles and names ending with a dot", () => {
    expect(graphViewDisplayText(".config")).toBe(".config");
    expect(graphViewDisplayText("folder/name.")).toBe("name.");
    expect(graphViewDisplayText("folder/.config.json")).toBe(".config.json");
    expect(graphViewDisplayText("assets/diagram.svg")).toBe("diagram.svg");
  });

  it("keeps attachment names intact while stripping folders", () => {
    expect(graphViewBasename("assets/diagram.svg")).toBe("diagram.svg");
    expect(isGraphViewMarkdownPath("docs/README.MD")).toBe(true);
    expect(isGraphViewMarkdownPath("assets/diagram.svg")).toBe(false);
  });
});
