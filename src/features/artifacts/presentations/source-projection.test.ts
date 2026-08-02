import { describe, expect, it } from "vitest";
import type {
  PresentationEditorSavedElement,
  PresentationEditorSavedSlide,
} from "./editor-project";
import { presentationProjectableBlocks } from "./source-projection";

type EditorChartElement = Extract<PresentationEditorSavedElement, { type: "chart" }>;
type EditorImageElement = Extract<PresentationEditorSavedElement, { type: "image" }>;
type EditorShapeElement = Extract<PresentationEditorSavedElement, { type: "shape" }>;
type EditorSlide = PresentationEditorSavedSlide;
type EditorTableElement = Extract<PresentationEditorSavedElement, { type: "table" }>;
type EditorTextElement = Extract<PresentationEditorSavedElement, { type: "text" }>;

const contentNode = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const base = (id: string, top: number, left: number) => ({
  height: 40,
  id,
  left,
  rotate: 0,
  top,
  width: 200,
});

function textElement(
  id: string,
  text: string,
  top: number,
  left: number,
  style?: string,
): EditorTextElement {
  return {
    ...base(id, top, left),
    autoFit: false,
    contentNode: contentNode(text),
    defaultColor: "#000000",
    defaultFontName: "Arial",
    ...(style ? { style } : {}),
    type: "text",
    vertical: false,
  };
}

describe("presentationProjectableBlocks", () => {
  it("projects semantic content in deterministic reading order", () => {
    const shape = {
      ...base("shape", 90, 10),
      fill: "#fff",
      fixedRatio: false,
      path: "",
      pathFormula: "rect",
      text: { contentNode: contentNode("Shape copy") },
      type: "shape",
      viewBox: [200, 40],
    } satisfies EditorShapeElement;
    const table = {
      ...base("table", 160, 10),
      colWidths: [0.5, 0.5],
      data: [
        [
          { colspan: 1, id: "c1", rowspan: 1, text: "Metric" },
          { colspan: 1, id: "c2", rowspan: 1, text: "Value" },
        ],
        [
          { colspan: 1, id: "c3", rowspan: 1, text: "Accuracy" },
          { colspan: 1, id: "c4", rowspan: 1, text: "92%" },
        ],
      ],
      outlineStyle: "full",
      rowHeights: [0.5, 0.5],
      theme: {
        colFooter: false,
        colHeader: false,
        rowFooter: false,
        rowHeader: true,
      },
      type: "table",
    } satisfies EditorTableElement;
    const chart = {
      ...base("chart", 220, 10),
      chartType: "bar",
      data: [{ label: "A", value: 12 }],
      names: ["Series A"],
      title: "Results",
      type: "chart",
      x: "label",
      y: "value",
    } satisfies EditorChartElement;
    const image = {
      ...base("image", 280, 10),
      fixedRatio: true,
      src: "storage/private-image.png",
      type: "image",
    } satisfies EditorImageElement;
    const slide = {
      elements: [
        textElement("body", "Body copy", 90, 300),
        table,
        textElement("title", "Quarterly report", 10, 20, "$title"),
        image,
        chart,
        shape,
      ],
      height: 540,
      id: "slide-1",
      remark: "Speaker-only context",
      width: 960,
    } satisfies EditorSlide;

    const blocks = presentationProjectableBlocks({
      slides: [slide],
      title: "Company review",
    });

    expect(blocks.map((block) => [block.kind, block.exactText])).toEqual([
      ["heading", "Quarterly report"],
      ["paragraph", "Shape copy"],
      ["paragraph", "Body copy"],
      ["table", "Metric | Value\nAccuracy | 92%"],
      [
        "structured_node",
        'Chart type: bar\nTitle: Results\nCategory field: label\nValue fields: value\nSeries: Series A\nData: [{"label":"A","value":12}]',
      ],
      ["paragraph", "Speaker-only context"],
    ]);
    expect(
      blocks.every(
        (block) => block.headingPath?.join(" / ") === "Company review / Quarterly report",
      ),
    ).toBe(true);
    expect(blocks.map((block) => block.locator)).toEqual([
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/elements/2" },
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/elements/5" },
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/elements/0" },
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/elements/1" },
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/elements/4" },
      { dialect: "json-pointer", kind: "structured_path", path: "/slides/0/remark" },
    ]);
    expect(JSON.stringify(blocks)).not.toContain("private-image");
  });

  it("uses the first readable text and then Slide N as title fallbacks", () => {
    const slides = [
      {
        elements: [textElement("lower", "Lower", 100, 20), textElement("upper", "Upper", 20, 20)],
        height: 540,
        id: "slide-1",
        width: 960,
      },
      {
        elements: [],
        height: 540,
        id: "slide-2",
        remark: "Notes only",
        width: 960,
      },
    ] satisfies EditorSlide[];

    const blocks = presentationProjectableBlocks({ slides, title: "Deck" });

    expect(blocks[0]?.kind).toBe("heading");
    expect(blocks[0]?.headingPath).toEqual(["Deck", "Upper"]);
    expect(blocks.at(-1)?.headingPath).toEqual(["Deck", "Slide 2"]);
  });
});
