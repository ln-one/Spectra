import fs from "fs";
import path from "path";

describe("SourcesPanel horizontal scrollbar", () => {
  it("uses ScrollAreaThumb instead of nested ScrollAreaScrollbar", () => {
    const filePath = path.join(
      process.cwd(),
      "components/project/features/sources/SourcesPanel.tsx"
    );
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).toContain("<ScrollAreaPrimitive.ScrollAreaThumb");
    expect(source).not.toContain(
      "<ScrollAreaPrimitive.ScrollAreaScrollbar className=\"relative flex-1 rounded-full bg-border\" />"
    );
  });
});
