import type { PptdPage } from "@deckelier/contracts";
import { convert } from "html-to-text";
import type { ProjectableBlock } from "@/features/knowledge/projection";
import type {
  PresentationEditorSavedElement,
  PresentationEditorSavedSlide,
} from "./editor-project";

type ProjectionTextElement = {
  contentNode: unknown;
  left: number;
  style?: string;
  textType?: string;
  top: number;
  type: "text";
};

type ProjectionShapeElement = {
  left: number;
  text?: { contentNode: unknown; type?: string };
  top: number;
  type: "shape";
};

type ProjectionTableElement = {
  data: Array<Array<{ text?: string } | null>>;
  left: number;
  top: number;
  type: "table";
};

type ProjectionChartElement = {
  chartType: string;
  data?: Array<Record<string, unknown>>;
  left: number;
  names?: unknown[];
  title?: string | Record<string, unknown>;
  top: number;
  type: "chart";
  x?: string;
  y?: string | string[];
};

type ProjectionElement =
  | ProjectionTextElement
  | ProjectionShapeElement
  | ProjectionTableElement
  | ProjectionChartElement
  | { left: number; top: number; type: "ignored" };

type PresentationProjectionSlide = {
  elements: ProjectionElement[];
  remark?: string;
};

type PresentationProjectionProject = {
  slides: PresentationProjectionSlide[];
  title: string;
};

function normalizedText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function sourceRichText(value: string | undefined) {
  return normalizedText(
    convert(value ?? "", {
      selectors: [
        { format: "skip", selector: "script" },
        { format: "skip", selector: "style" },
      ],
      wordwrap: false,
    }),
  );
}

function contentNodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  const ownText =
    typeof node.text === "string"
      ? node.text
      : node.type === "math" &&
          node.attrs &&
          typeof node.attrs === "object" &&
          typeof Reflect.get(node.attrs, "tex") === "string"
        ? `$${String(Reflect.get(node.attrs, "tex"))}$`
        : "";
  const children = Array.isArray(node.content)
    ? node.content.map(contentNodeText).filter(Boolean)
    : [];
  const separator =
    node.type === "doc" ||
    node.type === "paragraph" ||
    node.type === "list_item" ||
    node.type === "bullet_list" ||
    node.type === "ordered_list"
      ? "\n"
      : "";
  return normalizedText([ownText, children.join(separator)].filter(Boolean).join(separator));
}

function textContentNode(text: string) {
  return {
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    type: "doc",
  };
}

type PptdElement = PptdPage["elements"][number];

function sourceBounds(element: PptdElement) {
  return {
    left: element.bounds[0],
    top: element.bounds[1],
  };
}

function sourceElement(element: PptdElement): ProjectionElement {
  const bounds = sourceBounds(element);
  if (element.elementType === "text") {
    return {
      ...bounds,
      contentNode: textContentNode(sourceRichText(element.content.text)),
      ...(typeof element.content.style === "string" ? { style: element.content.style } : {}),
      type: "text",
    };
  }
  if (element.elementType === "table") {
    return {
      ...bounds,
      data: element.rows.map((row) =>
        row.map((cell) => (cell ? { text: sourceRichText(cell.content?.text) } : null)),
      ),
      type: "table",
    };
  }
  if (element.elementType === "chart") {
    return {
      ...bounds,
      chartType: element.type,
      ...(element.data ? { data: element.data } : {}),
      ...(element.names ? { names: element.names } : {}),
      ...(element.title ? { title: element.title } : {}),
      type: "chart",
      ...(element.x ? { x: element.x } : {}),
      ...(element.y ? { y: element.y } : {}),
    };
  }
  return { ...bounds, type: "ignored" };
}

function presentationProjectionSlidesFromPptd(
  slides: readonly PptdPage[],
): PresentationProjectionSlide[] {
  return slides.map((slide) => ({
    elements: slide.elements.map(sourceElement),
    ...(slide.notes ? { remark: sourceRichText(slide.notes) } : {}),
  }));
}

function projectionElementFromEditor(element: PresentationEditorSavedElement): ProjectionElement {
  const left = typeof element.left === "number" && Number.isFinite(element.left) ? element.left : 0;
  const top = typeof element.top === "number" && Number.isFinite(element.top) ? element.top : 0;
  if (element.type === "text") {
    return {
      contentNode: element.contentNode,
      left,
      ...(element.style ? { style: element.style } : {}),
      ...(element.textType ? { textType: element.textType } : {}),
      top,
      type: "text",
    };
  }
  if (element.type === "shape") {
    return {
      left,
      ...(element.text
        ? {
            text: {
              contentNode: element.text.contentNode,
              ...(element.text.type ? { type: element.text.type } : {}),
            },
          }
        : {}),
      top,
      type: "shape",
    };
  }
  if (element.type === "table") {
    return { data: element.data, left, top, type: "table" };
  }
  if (element.type === "chart") {
    return {
      chartType: element.chartType,
      ...(element.data ? { data: element.data } : {}),
      left,
      ...(element.names ? { names: element.names } : {}),
      ...(element.title ? { title: element.title } : {}),
      top,
      type: "chart",
      ...(element.x ? { x: element.x } : {}),
      ...(element.y ? { y: element.y } : {}),
    };
  }
  return { left, top, type: "ignored" };
}

function projectionSlidesFromEditor(
  slides: readonly PresentationEditorSavedSlide[],
): PresentationProjectionSlide[] {
  return slides.map((slide) => ({
    elements: slide.elements.map(projectionElementFromEditor),
    ...(slide.remark ? { remark: slide.remark } : {}),
  }));
}

function elementText(element: ProjectionElement) {
  if (element.type === "text") return contentNodeText(element.contentNode);
  if (element.type === "shape") return contentNodeText(element.text?.contentNode);
  return "";
}

function elementTextType(element: ProjectionElement) {
  if (element.type === "text") return element.textType;
  if (element.type === "shape") return element.text?.type;
  return undefined;
}

function isTitleElement(element: ProjectionElement) {
  const textType = elementTextType(element);
  return (
    ["title", "$title", "coverTitle", "$coverTitle"].includes(textType ?? "") ||
    (element.type === "text" && ["$title", "$coverTitle"].includes(element.style ?? ""))
  );
}

function orderedSlideElements(slide: PresentationProjectionSlide) {
  return slide.elements
    .map((element, originalIndex) => ({ element, originalIndex }))
    .sort(
      (left, right) =>
        left.element.top - right.element.top ||
        left.element.left - right.element.left ||
        left.originalIndex - right.originalIndex,
    );
}

function slideIdentity(ordered: ReturnType<typeof orderedSlideElements>, index: number) {
  const explicit = ordered.find(({ element }) => isTitleElement(element) && elementText(element));
  const fallback = ordered.find(({ element }) => elementText(element));
  const candidate = explicit ?? fallback;
  return {
    title: (candidate ? elementText(candidate.element) : "") || `Slide ${index + 1}`,
    titleElementIndex: candidate?.originalIndex ?? null,
  };
}

function tableText(element: ProjectionTableElement) {
  return normalizedText(
    element.data
      .map((row) =>
        row
          .map((cell) => normalizedText(cell?.text ?? ""))
          .filter(Boolean)
          .join(" | "),
      )
      .filter(Boolean)
      .join("\n"),
  );
}

function chartText(element: ProjectionChartElement) {
  const lines = [`Chart type: ${element.chartType}`];
  const title =
    typeof element.title === "string"
      ? normalizedText(element.title)
      : contentNodeText(element.title);
  if (title) lines.push(`Title: ${title}`);
  if (element.x) lines.push(`Category field: ${element.x}`);
  if (element.y) {
    lines.push(`Value fields: ${Array.isArray(element.y) ? element.y.join(", ") : element.y}`);
  }
  const names = element.names?.filter(
    (value): value is string | number | boolean =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  );
  if (names?.length) lines.push(`Series: ${names.map(String).join(", ")}`);
  const excludedDataKeys = new Set([
    "objectKey",
    "objectVersionId",
    "path",
    "sha256",
    "src",
    "storageKey",
    "storageVersionId",
    "url",
  ]);
  const data = element.data
    ?.map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(
            ([key, value]) =>
              !excludedDataKeys.has(key) &&
              (value === null ||
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"),
          )
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    )
    .filter((row) => Object.keys(row).length > 0);
  if (data?.length) lines.push(`Data: ${JSON.stringify(data)}`);
  return normalizedText(lines.join("\n"));
}

function elementBlock(
  element: ProjectionElement,
  originalIndex: number,
  headingPath: string[],
  slideIndex: number,
  titleElementIndex: number | null,
): ProjectableBlock | null {
  const locator = {
    kind: "structured_path" as const,
    dialect: "json-pointer" as const,
    path: `/slides/${slideIndex}/elements/${originalIndex}`,
  };
  if (element.type === "text" || element.type === "shape") {
    const exactText = elementText(element);
    if (!exactText) return null;
    return {
      kind:
        originalIndex === titleElementIndex || isTitleElement(element) ? "heading" : "paragraph",
      headingPath,
      exactText,
      locator,
    };
  }
  if (element.type === "table") {
    const exactText = tableText(element);
    return exactText ? { kind: "table", headingPath, exactText, locator } : null;
  }
  if (element.type === "chart") {
    const exactText = chartText(element);
    return exactText ? { kind: "structured_node", headingPath, exactText, locator } : null;
  }
  return null;
}

function projectPresentationBlocks(project: PresentationProjectionProject): ProjectableBlock[] {
  const presentationTitle = normalizedText(project.title);
  const blocks: ProjectableBlock[] = [];
  for (const [slideIndex, slide] of project.slides.entries()) {
    const ordered = orderedSlideElements(slide);
    const { title, titleElementIndex } = slideIdentity(ordered, slideIndex);
    const headingPath = [presentationTitle, title];
    for (const { element, originalIndex } of ordered) {
      const block = elementBlock(
        element,
        originalIndex,
        headingPath,
        slideIndex,
        titleElementIndex,
      );
      if (block) blocks.push(block);
    }
    const remark = normalizedText(slide.remark ?? "");
    if (remark) {
      blocks.push({
        kind: "paragraph",
        headingPath,
        exactText: remark,
        locator: {
          kind: "structured_path",
          dialect: "json-pointer",
          path: `/slides/${slideIndex}/remark`,
        },
      });
    }
  }
  return blocks;
}

export function presentationProjectableBlocks(project: {
  slides: PresentationEditorSavedSlide[];
  title: string;
}): ProjectableBlock[] {
  return projectPresentationBlocks({
    slides: projectionSlidesFromEditor(project.slides),
    title: project.title,
  });
}

export function presentationPptdProjectableBlocks(project: {
  slides: PptdPage[];
  title: string;
}): ProjectableBlock[] {
  return projectPresentationBlocks({
    slides: presentationProjectionSlidesFromPptd(project.slides),
    title: project.title,
  });
}
