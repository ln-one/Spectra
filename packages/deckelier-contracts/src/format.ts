import { parse } from "yaml";
import { z } from "zod";

const solidFillSchema = z.object({ type: z.literal("solid"), color: z.string() }).passthrough();
const gradientFillSchema = z
  .object({
    type: z.literal("gradient"),
    gradientType: z.enum(["linear", "radial"]),
    stops: z.array(z.object({ position: z.number(), color: z.string() })),
  })
  .passthrough();
const imageFillSchema = z.object({ type: z.literal("image"), src: z.string() }).passthrough();
const fillSchema = z.discriminatedUnion("type", [
  solidFillSchema,
  gradientFillSchema,
  imageFillSchema,
]);

const elementBase = {
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  elementId: z.string().min(1),
};
const textElementSchema = z
  .object({
    ...elementBase,
    content: z
      .object({
        style: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
        text: z.coerce.string(),
      })
      .passthrough(),
    elementType: z.literal("text"),
  })
  .passthrough();
const shapeElementSchema = z
  .object({
    ...elementBase,
    elementType: z.enum(["line", "shape"]),
    fill: fillSchema.optional(),
    shapeName: z.string().optional(),
    shapeType: z.string().optional(),
  })
  .passthrough()
  .superRefine((element, context) => {
    if (element.shapeName === undefined && element.shapeType === undefined) {
      context.addIssue({ code: "custom", message: "Shapes require a name" });
    }
  });
const imageElementSchema = z
  .object({
    ...elementBase,
    elementType: z.literal("image"),
    src: z.string(),
  })
  .passthrough();
const iconElementSchema = z
  .object({
    ...elementBase,
    elementType: z.literal("icon"),
    fill: fillSchema.optional(),
    iconName: z.string(),
  })
  .passthrough();
const tableCellSchema = z
  .object({
    content: z.object({ text: z.coerce.string() }).passthrough().optional(),
    fill: fillSchema.optional(),
  })
  .passthrough();
const tableElementSchema = z
  .object({
    ...elementBase,
    elementType: z.literal("table"),
    rows: z.array(z.array(tableCellSchema.nullable())),
  })
  .passthrough();
const chartElementSchema = z
  .object({
    ...elementBase,
    elementType: z.literal("chart"),
    data: z.array(z.record(z.string(), z.unknown())).optional(),
    fill: fillSchema.optional(),
    names: z.array(z.unknown()).optional(),
    title: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    type: z.string(),
    x: z.string().optional(),
    y: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

const presentationSchema = z.object({
  pages: z.array(z.string()).min(1),
  size: z.tuple([z.number().positive(), z.number().positive()]),
  title: z.string().optional(),
});

const pageSchema = z.object({
  background: fillSchema.optional(),
  elements: z.array(
    z.union([
      textElementSchema,
      shapeElementSchema,
      imageElementSchema,
      iconElementSchema,
      tableElementSchema,
      chartElementSchema,
    ]),
  ),
  notes: z.string().optional(),
  pageType: z
    .enum(["cover", "table_of_contents", "chapter", "content", "final", "unknown"])
    .default("content"),
});

export type PptdPage = z.infer<typeof pageSchema>;

export interface PptdProject {
  pages: PptdPage[];
  title: string;
}

function normalizePptdPath(value: string): string {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function pptdPagePaths(content: string): string[] {
  return presentationSchema.parse(parse(content)).pages.map(normalizePptdPath);
}

export function parsePptdProject(
  pptdContent: string,
  pageMap: Readonly<Record<string, string>>,
): PptdProject {
  const presentation = presentationSchema.parse(parse(pptdContent));
  const normalizedPages = new Map(
    Object.entries(pageMap).map(([pagePath, content]) => [normalizePptdPath(pagePath), content]),
  );
  return {
    pages: presentation.pages.map((pagePath) => {
      const content = normalizedPages.get(normalizePptdPath(pagePath));
      if (content === undefined) throw new Error("pptd_page_missing");
      return pageSchema.parse(parse(content));
    }),
    title: presentation.title ?? "Untitled",
  };
}

function isLocalPptdImage(source: string) {
  if (!source) return false;
  if (/^(https?:\/\/|\/\/)/.test(source)) return false;
  return !/^data:image\/[^;]+;base64,/.test(source);
}

export function pptdPageLocalAssetPaths(content: string): string[] {
  const page = pageSchema.parse(parse(content));
  const paths = new Set<string>();
  const addFill = (fill: unknown) => {
    if (!fill || typeof fill !== "object") return;
    const value = fill as { src?: unknown; type?: unknown };
    if (value.type === "image" && typeof value.src === "string" && isLocalPptdImage(value.src)) {
      paths.add(value.src);
    }
  };
  addFill(page.background);
  for (const element of page.elements) {
    if (element.elementType === "image" && isLocalPptdImage(element.src)) paths.add(element.src);
    if ("fill" in element) addFill(element.fill);
    if (element.elementType === "table") {
      for (const row of element.rows) {
        for (const cell of row) addFill(cell?.fill);
      }
    }
  }
  return [...paths];
}
