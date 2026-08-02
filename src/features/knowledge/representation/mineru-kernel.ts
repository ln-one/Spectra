import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { type DefaultTreeAdapterMap, parse as parseHtml } from "parse5";
import { type Entry, fromBuffer, type ZipFile } from "yauzl";
import { z } from "zod";
import type { SourceFileExtension } from "@/features/sources/validation";
import type { EvidenceLocator } from "../contracts";
import { knowledgeContentHash } from "../integrity";
import type { ProjectableBlock } from "../projection";
import type { CanonicalSourceRepresentation } from "./contracts";
import { representation, spreadsheetColumn, tableContent } from "./shared";

const MAX_RESULT_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_RESULT_ENTRIES = 4_096;
const MAX_RESULT_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_TABLE_ROWS = 10_000;
const MAX_TABLE_GRID_CELLS = 100_000;
const MAX_TABLE_SPAN = 1_000;

function openZip(bytes: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(Buffer.from(bytes), { autoClose: false, lazyEntries: true }, (error, zipFile) =>
      error ? reject(error) : resolve(zipFile),
    );
  });
}

function safeEntry(entry: Entry) {
  const name = entry.fileName.replaceAll("\\", "/");
  if (name.endsWith("/")) return null;
  if (name.startsWith("/") || name.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("knowledge_mineru_zip_path_invalid");
  }
  if (entry.uncompressedSize <= 0 || entry.uncompressedSize > MAX_RESULT_ENTRY_BYTES) {
    throw new Error("knowledge_source_result_too_large");
  }
  return { entry, name, depth: name.split("/").length };
}

function listEntries(zipFile: ZipFile) {
  return new Promise<Array<NonNullable<ReturnType<typeof safeEntry>>>>((resolve, reject) => {
    const entries: Array<NonNullable<ReturnType<typeof safeEntry>>> = [];
    let uncompressedBytes = 0;
    zipFile.on("error", reject);
    zipFile.on("entry", (entry: Entry) => {
      try {
        const candidate = safeEntry(entry);
        if (candidate) {
          uncompressedBytes += candidate.entry.uncompressedSize;
          if (
            entries.length >= MAX_RESULT_ENTRIES ||
            uncompressedBytes > MAX_RESULT_UNCOMPRESSED_BYTES
          ) {
            throw new Error("knowledge_source_result_too_large");
          }
          if (entries.some(({ name }) => name === candidate.name)) {
            throw new Error("knowledge_mineru_result_ambiguous");
          }
          entries.push(candidate);
        }
        zipFile.readEntry();
      } catch (error) {
        reject(error);
      }
    });
    zipFile.on("end", () => resolve(entries));
    zipFile.readEntry();
  });
}

function readEntry(zipFile: ZipFile, entry: Entry): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESULT_ENTRY_BYTES)
          stream.destroy(new Error("knowledge_source_result_too_large"));
        else chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

const mineruRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const mineruBboxSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const mineruTypeSchema = z.enum([
  "text",
  "title",
  "paragraph",
  "equation",
  "equation_interline",
  "image",
  "chart",
  "table",
  "code",
  "algorithm",
  "list",
  "index",
  "header",
  "footer",
  "page_header",
  "page_footer",
  "page_number",
  "aside_text",
  "page_aside_text",
  "page_footnote",
]);
const providerPageRegionSchema = z
  .object({
    page_idx: z.int().nonnegative(),
    bbox: mineruBboxSchema.optional(),
    rotation: mineruRotationSchema.optional(),
  })
  .strict();
const mineruV2ItemSchema = z
  .object({
    type: mineruTypeSchema,
    sub_type: z.string().optional(),
    content: z.record(z.string(), z.unknown()),
    bbox: mineruBboxSchema.optional(),
    rotation: mineruRotationSchema.optional(),
    anchor: z.string().trim().min(1).optional(),
    page_regions: z.array(providerPageRegionSchema).min(1).optional(),
  })
  .strict();
const mineruMiddleSchema = z
  .object({
    _backend: z.string().trim().min(1).optional(),
    _version_name: z.string().trim().min(1).optional(),
    pdf_info: z
      .array(
        z
          .object({
            page_idx: z.int().nonnegative(),
            para_blocks: z.array(z.record(z.string(), z.unknown())),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type MineruV2Item = z.infer<typeof mineruV2ItemSchema>;
type MineruMiddle = z.infer<typeof mineruMiddleSchema>;
type MineruMiddlePage = NonNullable<MineruMiddle["pdf_info"]>[number];
const mineruV2InlineSpanSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.enum(["text", "equation_inline", "phonetic", "md", "code_inline", "hyperlink"]),
      content: z.string(),
      style: z.array(z.string()).optional(),
      url: z.string().optional(),
      children: z.array(mineruV2InlineSpanSchema).optional(),
    })
    .strict(),
);
const mineruV2InlineContentSchema = z.array(mineruV2InlineSpanSchema);
const mineruV2BasicListItemSchema = z
  .object({
    item_type: z.literal("text"),
    item_content: mineruV2InlineContentSchema,
  })
  .strict();
const mineruV2OfficeListItemSchema = mineruV2BasicListItemSchema.extend({
  ilevel: z.int().nonnegative(),
  prefix: z.string(),
  anchor: z.string().trim().min(1).optional(),
});
const mineruV2ListItemSchema = z.union([mineruV2OfficeListItemSchema, mineruV2BasicListItemSchema]);
const mineruV2ImageSourceSchema = z
  .object({
    path: z.string(),
  })
  .strict();
const mineruV2ContentSchemas: Record<MineruV2Item["type"], z.ZodType> = {
  title: z
    .object({ title_content: mineruV2InlineContentSchema, level: z.int().positive() })
    .strict(),
  paragraph: z.object({ paragraph_content: mineruV2InlineContentSchema }).strict(),
  text: z
    .object({
      paragraph_content: mineruV2InlineContentSchema.optional(),
      text_content: mineruV2InlineContentSchema.optional(),
      content: mineruV2InlineContentSchema.optional(),
    })
    .strict(),
  equation: z
    .object({
      math_content: z.string(),
      math_type: z.literal("latex"),
      image_source: mineruV2ImageSourceSchema.optional(),
    })
    .strict(),
  equation_interline: z
    .object({
      math_content: z.string(),
      math_type: z.literal("latex"),
      image_source: mineruV2ImageSourceSchema.optional(),
    })
    .strict(),
  image: z
    .object({
      image_source: mineruV2ImageSourceSchema,
      content: z.string().optional(),
      image_caption: mineruV2InlineContentSchema,
      image_footnote: mineruV2InlineContentSchema.optional(),
    })
    .strict(),
  chart: z
    .object({
      image_source: mineruV2ImageSourceSchema,
      content: z.string(),
      chart_caption: mineruV2InlineContentSchema,
      chart_footnote: mineruV2InlineContentSchema.optional(),
    })
    .strict(),
  table: z
    .object({
      image_source: mineruV2ImageSourceSchema.optional(),
      html: z.string(),
      table_type: z.enum(["simple_table", "complex_table"]),
      table_nest_level: z.int().positive(),
      table_caption: mineruV2InlineContentSchema,
      table_footnote: mineruV2InlineContentSchema.optional(),
    })
    .strict(),
  code: z
    .object({
      code_content: mineruV2InlineContentSchema,
      code_caption: mineruV2InlineContentSchema,
      code_footnote: mineruV2InlineContentSchema.optional(),
      code_language: z.string().min(1).optional(),
    })
    .strict(),
  algorithm: z
    .object({
      algorithm_content: mineruV2InlineContentSchema,
      algorithm_caption: mineruV2InlineContentSchema,
      algorithm_footnote: mineruV2InlineContentSchema.optional(),
    })
    .strict(),
  list: z
    .object({
      list_type: z.enum(["text_list", "reference_list"]),
      attribute: z.enum(["ordered", "unordered"]).optional(),
      list_items: z.array(mineruV2ListItemSchema).min(1),
    })
    .strict(),
  index: z
    .object({
      list_type: z.enum(["text_list", "reference_list"]),
      list_items: z.array(mineruV2ListItemSchema).min(1),
    })
    .strict(),
  header: z.object({ header_content: mineruV2InlineContentSchema }).strict(),
  footer: z.object({ footer_content: mineruV2InlineContentSchema }).strict(),
  page_header: z.object({ page_header_content: mineruV2InlineContentSchema }).strict(),
  page_footer: z.object({ page_footer_content: mineruV2InlineContentSchema }).strict(),
  page_number: z.object({ page_number_content: mineruV2InlineContentSchema }).strict(),
  aside_text: z.object({ aside_text_content: mineruV2InlineContentSchema }).strict(),
  page_aside_text: z.object({ page_aside_text_content: mineruV2InlineContentSchema }).strict(),
  page_footnote: z.object({ page_footnote_content: mineruV2InlineContentSchema }).strict(),
};

function validateV2Content(item: MineruV2Item) {
  const parsed = mineruV2ContentSchemas[item.type].safeParse(item.content);
  if (!parsed.success) {
    throw new Error(`knowledge_mineru_schema_drift:${item.type}`, { cause: parsed.error });
  }
}

function schemaShape(value: unknown, depth = 0): string {
  if (depth >= 3) return Array.isArray(value) ? "array" : typeof value;
  if (Array.isArray(value)) return `array_${schemaShape(value[0], depth + 1)}`;
  if (!value || typeof value !== "object") return typeof value;
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 8)
    .map(
      ([key, child]) =>
        `${key.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_")}_${schemaShape(child, depth + 1)}`,
    )
    .join("_");
}

function hasMergedAwayTable(page: MineruMiddlePage) {
  const first = page.para_blocks[0];
  if (first?.type !== "table" || !Array.isArray(first.blocks) || first.blocks.length === 0) {
    return false;
  }
  return first.blocks.every(
    (block) =>
      block !== null && typeof block === "object" && Reflect.get(block, "lines_deleted") === true,
  );
}

function applyCrossPageTableRegions(pages: MineruV2Item[][], middle: MineruMiddle | undefined) {
  if (!middle?.pdf_info) return pages;
  if (new Set(middle.pdf_info.map((page) => page.page_idx)).size !== middle.pdf_info.length) {
    throw new Error("knowledge_mineru_middle_page_ambiguous");
  }
  const middleByPage = new Map(middle.pdf_info.map((page) => [page.page_idx, page]));
  const output = pages.map((page) => [...page]);
  let owner: MineruV2Item | undefined;
  let ownerPageIndex = -1;
  for (let pageIndex = 0; pageIndex < output.length; pageIndex += 1) {
    const page = output[pageIndex];
    if (!page) continue;
    const isContinuation = hasMergedAwayTable(
      middleByPage.get(pageIndex) ?? { page_idx: pageIndex, para_blocks: [] },
    );
    if (isContinuation) {
      const continuation = page[0];
      const continuationHtml =
        continuation?.type === "table" ? contentField(continuation.content, "html") : "";
      if (
        !owner ||
        ownerPageIndex !== pageIndex - 1 ||
        continuation?.type !== "table" ||
        continuationHtml
      ) {
        throw new Error("knowledge_mineru_cross_page_table_invalid");
      }
      const regions = owner.page_regions ?? [
        { page_idx: ownerPageIndex, ...(owner.bbox ? { bbox: owner.bbox } : {}) },
      ];
      owner.page_regions = [
        ...regions,
        { page_idx: pageIndex, ...(continuation.bbox ? { bbox: continuation.bbox } : {}) },
      ];
      ownerPageIndex = pageIndex;
      page.shift();
    }
    const latestTable = [...page].reverse().find((item) => item.type === "table");
    if (latestTable) {
      owner = latestTable;
      ownerPageIndex = pageIndex;
    }
  }
  return output;
}

function normalizedBox(bbox: readonly number[]) {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = bbox;
  const box = { left: x1 / 1_000, top: y1 / 1_000, right: x2 / 1_000, bottom: y2 / 1_000 };
  if (
    Object.values(box).some((value) => value < 0 || value > 1) ||
    box.right < box.left ||
    box.bottom < box.top
  ) {
    throw new Error("knowledge_mineru_bbox_invalid");
  }
  return box;
}

function pageRegions(input: {
  pageIndex: number;
  bbox?: readonly number[] | undefined;
  rotation?: 0 | 90 | 180 | 270 | undefined;
  anchor?: string | undefined;
  regions?: Array<z.infer<typeof providerPageRegionSchema>> | undefined;
}): EvidenceLocator {
  const regions = (
    input.regions ?? [{ page_idx: input.pageIndex, bbox: input.bbox, rotation: input.rotation }]
  ).map((region) => ({
    pageIndex: region.page_idx,
    boxes: region.bbox ? [normalizedBox(region.bbox)] : [],
    ...(region.rotation !== undefined ? { rotation: region.rotation } : {}),
  }));
  return {
    kind: "page_regions",
    regions,
    ...(input.anchor ? { anchor: input.anchor } : {}),
  };
}

function joined(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(joined).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content.trim();
  if (Array.isArray(record.item_content)) {
    return [
      typeof record.prefix === "string" ? record.prefix.trim() : "",
      joined(record.item_content),
    ]
      .filter(Boolean)
      .join(" ");
  }
  return joined(record.children);
}

function contentField(content: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const text = joined(content[key]);
    if (text) return text;
  }
  return "";
}

function htmlTableCells(html: string) {
  const document = parseHtml(html);
  const rows: DefaultTreeAdapterMap["element"][] = [];
  const activeElements = new Set(["script", "style", "iframe", "object", "embed", "template"]);
  const unsupportedVisualElements = new Set(["img", "svg", "canvas", "video", "audio"]);
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    const element = node as DefaultTreeAdapterMap["element"];
    if (activeElements.has(element.tagName)) throw new Error("knowledge_mineru_table_invalid");
    if (unsupportedVisualElements.has(element.tagName)) {
      throw new Error("knowledge_mineru_table_visual_unsupported");
    }
    if (element.tagName === "tr") rows.push(element);
    const parent = node as DefaultTreeAdapterMap["parentNode"];
    if (Array.isArray(parent.childNodes)) parent.childNodes.forEach(visit);
  };
  const nodeText = (node: DefaultTreeAdapterMap["node"]): string => {
    if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value;
    const parent = node as DefaultTreeAdapterMap["parentNode"];
    return Array.isArray(parent.childNodes) ? parent.childNodes.map(nodeText).join("") : "";
  };
  visit(document);
  if (rows.length === 0 || rows.length > MAX_TABLE_ROWS) {
    throw new Error("knowledge_mineru_table_invalid");
  }
  const occupied = new Set<string>();
  const cells: Array<{
    address: string;
    value: string;
    rowSpan?: number;
    colSpan?: number;
  }> = [];
  rows.forEach((row, rowIndex) => {
    const children = (row as DefaultTreeAdapterMap["parentNode"]).childNodes ?? [];
    let columnIndex = 0;
    for (const child of children) {
      const cell = child as DefaultTreeAdapterMap["element"];
      if (cell.tagName !== "td" && cell.tagName !== "th") continue;
      while (occupied.has(`${rowIndex}:${columnIndex}`)) columnIndex += 1;
      const rowSpan = Number(cell.attrs.find((attr) => attr.name === "rowspan")?.value ?? 1);
      const colSpan = Number(cell.attrs.find((attr) => attr.name === "colspan")?.value ?? 1);
      const expandedCells = rowSpan * colSpan;
      if (
        !Number.isInteger(rowSpan) ||
        rowSpan < 1 ||
        rowSpan > MAX_TABLE_SPAN ||
        rowIndex + rowSpan > rows.length ||
        !Number.isInteger(colSpan) ||
        colSpan < 1 ||
        colSpan > MAX_TABLE_SPAN ||
        !Number.isSafeInteger(expandedCells) ||
        expandedCells > MAX_TABLE_GRID_CELLS ||
        occupied.size + expandedCells > MAX_TABLE_GRID_CELLS ||
        cells.length >= MAX_TABLE_GRID_CELLS
      ) {
        throw new Error("knowledge_mineru_table_invalid");
      }
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          occupied.add(`${rowIndex + rowOffset}:${columnIndex + columnOffset}`);
        }
      }
      cells.push({
        address: `${spreadsheetColumn(columnIndex)}${rowIndex + 1}`,
        value: nodeText(cell).replace(/\s+/g, " ").trim(),
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
      });
      columnIndex += colSpan;
    }
  });
  if (cells.length === 0) throw new Error("knowledge_mineru_table_invalid");
  return cells;
}

function tableBlock(input: {
  html: string;
  locator: EvidenceLocator;
  headingPath: string[];
  fidelity: "source" | "ocr";
}) {
  const cells = htmlTableCells(input.html);
  const text = cells.map((cell) => `${cell.address}: ${cell.value}`).join("\t");
  return {
    kind: "table" as const,
    headingPath: input.headingPath,
    exactText: text,
    indexText: text,
    locator: input.locator,
    content: tableContent(cells),
    fidelity: input.fidelity,
  };
}

function mineruAssetPath(path: string | undefined, entryNames: Set<string>) {
  if (!path) return undefined;
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "..")) {
    throw new Error("knowledge_mineru_asset_invalid");
  }
  const matches = [...entryNames].filter(
    (name) => name === normalized || name.endsWith(`/${normalized}`),
  );
  if (matches.length !== 1) throw new Error("knowledge_mineru_asset_missing");
  return matches[0];
}

function v2AssetPath(value: unknown, entryNames: Set<string>) {
  if (value === undefined) return undefined;
  const { path } = mineruV2ImageSourceSchema.parse(value);
  return path ? mineruAssetPath(path, entryNames) : undefined;
}

function captionBlock(
  text: string,
  locator: EvidenceLocator,
  headingPath: string[],
  fidelity: "source" | "ocr",
): ProjectableBlock[] {
  return text
    ? [
        {
          kind: "paragraph",
          headingPath,
          exactText: text,
          indexText: text,
          locator,
          content: { kind: "exact_text", text },
          fidelity,
        },
      ]
    : [];
}

function v2Blocks(
  itemsByPage: MineruV2Item[][],
  backend: string | undefined,
  entryNames: Set<string>,
) {
  const headingPath: string[] = [];
  const fidelity = backend === "office" ? ("source" as const) : ("ocr" as const);
  return itemsByPage.flatMap((items, pageIndex) =>
    items.flatMap((item): ProjectableBlock[] => {
      validateV2Content(item);
      const locator = pageRegions({
        pageIndex,
        bbox: item.bbox,
        rotation: item.rotation,
        anchor: item.anchor,
        regions: item.page_regions,
      });
      const content = item.content;
      if (item.type === "title") {
        const text = contentField(content, "title_content");
        const level = z.int().positive().parse(content.level);
        if (!text) {
          throw new Error(
            `knowledge_mineru_content_invalid:${item.type}:${schemaShape(item.content)}`,
          );
        }
        headingPath.splice(level - 1);
        headingPath[level - 1] = text;
        return [
          {
            kind: "heading",
            headingPath: [...headingPath],
            exactText: text,
            indexText: text,
            locator,
            content: { kind: "exact_text", text },
            fidelity,
          },
        ];
      }
      if (item.type === "image" || item.type === "chart") {
        const description = contentField(content, "image_content", "chart_content", "content");
        const assetEntryPath = v2AssetPath(content.image_source, entryNames);
        const caption = contentField(content, "image_caption", "chart_caption");
        const footnote = contentField(content, "image_footnote", "chart_footnote");
        return [
          {
            kind: "visual",
            headingPath: [...headingPath],
            exactText: description || null,
            indexText: description || null,
            locator,
            content: {
              kind: "visual_region",
              ...(description ? { accessibleDescription: description } : {}),
              ...(assetEntryPath
                ? { asset: { kind: "ingestion_archive_entry" as const, path: assetEntryPath } }
                : {}),
            },
            fidelity: "model-description",
          },
          ...captionBlock(caption, locator, [...headingPath], fidelity),
          ...captionBlock(footnote, locator, [...headingPath], fidelity),
        ];
      }
      if (item.type === "table") {
        const html = contentField(content, "html");
        const caption = contentField(content, "table_caption");
        const footnote = contentField(content, "table_footnote");
        if (!html.trim() && !caption && !footnote) return [];
        if (!html.includes("<table")) throw new Error("knowledge_mineru_table_invalid");
        return [
          tableBlock({ html, locator, headingPath: [...headingPath], fidelity }),
          ...captionBlock(caption, locator, [...headingPath], fidelity),
          ...captionBlock(footnote, locator, [...headingPath], fidelity),
        ];
      }
      if (item.type === "list" || item.type === "index") {
        const listItems = z.array(mineruV2ListItemSchema).min(1).parse(content.list_items);
        return listItems.map((listItem) => {
          const text = joined(listItem);
          const itemAnchor = "anchor" in listItem ? listItem.anchor : undefined;
          if (!text) throw new Error(`knowledge_mineru_content_invalid:${item.type}:list_item`);
          return {
            kind: "list" as const,
            headingPath: [...headingPath],
            exactText: text,
            indexText: text,
            locator:
              itemAnchor && locator.kind === "page_regions"
                ? { ...locator, anchor: itemAnchor }
                : locator,
            content: { kind: "exact_text" as const, text },
            fidelity,
          };
        });
      }
      const keysByType: Record<string, string[]> = {
        paragraph: ["paragraph_content"],
        text: ["paragraph_content", "text_content", "content"],
        equation: ["math_content"],
        equation_interline: ["math_content"],
        code: ["code_content"],
        algorithm: ["algorithm_content"],
        header: ["page_header_content", "header_content"],
        footer: ["page_footer_content", "footer_content"],
        page_header: ["page_header_content"],
        page_footer: ["page_footer_content"],
        page_number: ["page_number_content"],
        aside_text: ["page_aside_text_content", "aside_text_content"],
        page_aside_text: ["page_aside_text_content"],
        page_footnote: ["page_footnote_content"],
      };
      const text = contentField(content, ...(keysByType[item.type] ?? []));
      const trailingBlocks = [
        ...captionBlock(
          contentField(content, "code_caption", "algorithm_caption"),
          locator,
          [...headingPath],
          fidelity,
        ),
        ...captionBlock(
          contentField(content, "code_footnote", "algorithm_footnote"),
          locator,
          [...headingPath],
          fidelity,
        ),
      ];
      if (!text) {
        if (
          item.type === "paragraph" ||
          item.type === "text" ||
          [
            "header",
            "footer",
            "page_header",
            "page_footer",
            "page_number",
            "aside_text",
            "page_aside_text",
            "page_footnote",
          ].includes(item.type)
        ) {
          return [];
        }
        if ((item.type === "code" || item.type === "algorithm") && trailingBlocks.length > 0) {
          return trailingBlocks;
        }
        throw new Error(
          `knowledge_mineru_content_invalid:${item.type}:${schemaShape(item.content)}`,
        );
      }
      const auxiliary = ["header", "footer", "page_header", "page_footer", "page_number"].includes(
        item.type,
      );
      if (item.type === "equation" || item.type === "equation_interline") {
        v2AssetPath(content.image_source, entryNames);
      }
      const kind =
        item.type === "code" || item.type === "algorithm"
          ? ("code" as const)
          : ("paragraph" as const);
      return [
        {
          kind,
          headingPath: [...headingPath],
          exactText: text,
          indexText: auxiliary ? null : text,
          locator,
          content: { kind: "exact_text", text },
          fidelity,
        },
        ...trailingBlocks,
      ];
    }),
  );
}

function uniqueEntry(entries: Array<NonNullable<ReturnType<typeof safeEntry>>>, pattern: RegExp) {
  const matches = entries.filter(({ name }) => pattern.test(name));
  if (matches.length > 1) throw new Error("knowledge_mineru_result_ambiguous");
  return matches[0];
}

async function parseJsonEntry(zipFile: ZipFile, entry: Entry) {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(await readEntry(zipFile, entry)),
  );
}

async function mineruRepresentation(
  bytes: Uint8Array,
  format: SourceFileExtension,
): Promise<CanonicalSourceRepresentation> {
  const zipFile = await openZip(bytes);
  const archiveHash = createHash("sha256").update(bytes).digest("hex");
  try {
    const entries = await listEntries(zipFile);
    const entryNames = new Set(entries.map(({ name }) => name));
    const v2Entry = uniqueEntry(entries, /(?:^|\/)(?:.*_)?content_list_v2\.json$/i);
    const middleEntry = uniqueEntry(entries, /(?:^|\/)(?:.*_)?middle\.json$/i);
    const middle = middleEntry
      ? mineruMiddleSchema.parse(await parseJsonEntry(zipFile, middleEntry.entry))
      : undefined;
    const family = format === "png" || format === "jpg" || format === "jpeg" ? "image" : "paged";
    if (!v2Entry) throw new Error("knowledge_mineru_native_locator_missing");
    const raw = await readEntry(zipFile, v2Entry.entry);
    const items = z
      .array(z.array(mineruV2ItemSchema))
      .min(1)
      .parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
    return representation(
      format,
      family,
      "mineru-content-v3",
      v2Blocks(applyCrossPageTableRegions(items, middle), middle?._backend, entryNames),
      {
        adapterVersion: "3",
        metadata: {
          kind: "mineru",
          providerOutputSchema: "content-list-v2",
          archiveHash,
          contentListHash: knowledgeContentHash(
            new TextDecoder("utf-8", { fatal: true }).decode(raw),
          ),
          ...(middle?._backend ? { providerBackend: middle._backend } : {}),
          ...(middle?._version_name ? { providerVersion: middle._version_name } : {}),
        },
      },
    );
  } finally {
    zipFile.close();
  }
}

export function parseMineruRepresentation(bytes: Uint8Array, format: SourceFileExtension) {
  return mineruRepresentation(bytes, format);
}
