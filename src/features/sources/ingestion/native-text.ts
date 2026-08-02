import "server-only";

import { Buffer } from "node:buffer";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { XMLValidator } from "fast-xml-parser";
import { compile } from "html-to-text";
import { parseSync as parseSubtitles } from "subtitle";
import { parseDocument } from "yaml";
import { fromBuffer } from "yauzl";
import { z } from "zod";
import { MAX_NATIVE_TEXT_SOURCE_FILE_BYTES, type SourceNativeTextExtension } from "../validation";

const MAX_CSV_RECORD_BYTES = 1024 * 1024;
const MAX_CSV_ROWS = 100_000;
const MAX_SUBTITLE_SEGMENTS = 100_000;
const MAX_NOTEBOOK_CELLS = 100_000;
const MAX_NOTEBOOK_SOURCE_PARTS = 10_000;
const MAX_NOTEBOOK_CELL_BYTES = 1024 * 1024;
const MAX_XLSX_ENTRIES = 10_000;
const MAX_XLSX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_XLSX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_XLSX_SHEETS = 512;
const MAX_XLSX_ROWS = 100_000;
const MAX_XLSX_CELLS = 500_000;
const MAX_HTML_DEPTH = 128;
const MAX_HTML_CHILD_NODES = 10_000;

const nonBlankContentSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

const codeLanguages = {
  py: "python",
  ts: "typescript",
  js: "javascript",
  java: "java",
  cpp: "cpp",
  go: "go",
  rs: "rust",
  sql: "sql",
} as const;

const htmlToText = compile({
  wordwrap: false,
  limits: {
    maxChildNodes: MAX_HTML_CHILD_NODES,
    maxDepth: MAX_HTML_DEPTH,
    maxInputLength: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
  },
  selectors: [
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "noscript", format: "skip" },
  ],
});

export const nativeTextResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("text"),
      format: z.enum(["txt", "md", "html"]),
      content: nonBlankContentSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("table"),
      format: z.literal("csv"),
      rows: z.array(z.array(z.string()).min(1)).min(1).max(MAX_CSV_ROWS),
    })
    .strict()
    .superRefine((result, context) => {
      const columnCount = result.rows[0]?.length;
      for (const [index, row] of result.rows.entries()) {
        const recordBytes = row.reduce(
          (total, cell, cellIndex) =>
            total + Buffer.byteLength(cell, "utf8") + (cellIndex === 0 ? 0 : 1),
          0,
        );
        if (recordBytes > MAX_CSV_RECORD_BYTES) {
          context.addIssue({
            code: "too_big",
            maximum: MAX_CSV_RECORD_BYTES,
            origin: "array",
            path: ["rows", index],
          });
        }
        if (row.length !== columnCount) {
          context.addIssue({
            code: "custom",
            message: "CSV rows must have a consistent column count",
            path: ["rows", index],
          });
        }
      }
    }),
  z
    .object({
      schemaVersion: z.literal(2),
      kind: z.literal("workbook"),
      format: z.literal("xlsx"),
      sheets: z
        .array(
          z
            .object({
              id: z.string().min(1),
              name: z.string().min(1),
              mergedRanges: z.array(z.string()),
              rows: z.array(
                z
                  .object({
                    number: z.number().int().positive(),
                    cells: z.array(
                      z.object({
                        address: z.string().min(1),
                        value: z.string(),
                        displayValue: z.string(),
                        formula: z.string().optional(),
                      }),
                    ),
                  })
                  .strict(),
              ),
            })
            .strict(),
        )
        .min(1)
        .max(MAX_XLSX_SHEETS),
    })
    .strict()
    .superRefine((workbook, context) => {
      const rowCount = workbook.sheets.reduce((total, sheet) => total + sheet.rows.length, 0);
      const cellCount = workbook.sheets.reduce(
        (total, sheet) => total + sheet.rows.reduce((sum, row) => sum + row.cells.length, 0),
        0,
      );
      if (
        rowCount === 0 ||
        rowCount > MAX_XLSX_ROWS ||
        cellCount === 0 ||
        cellCount > MAX_XLSX_CELLS
      ) {
        context.addIssue({
          code: "custom",
          message: "Workbook content exceeds the supported bounds",
        });
      }
    }),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("structured_text"),
      format: z.enum(["json", "yaml", "yml", "xml", "html"]),
      content: nonBlankContentSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("subtitles"),
      format: z.enum(["srt", "vtt"]),
      segments: z
        .array(
          z
            .object({
              startMs: z.number().int().nonnegative(),
              endMs: z.number().int().positive(),
              text: nonBlankContentSchema,
            })
            .strict()
            .refine((segment) => segment.endMs > segment.startMs),
        )
        .min(1)
        .max(MAX_SUBTITLE_SEGMENTS),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("notebook"),
      format: z.literal("ipynb"),
      language: z.string().trim().min(1).max(64).optional(),
      cells: z
        .array(
          z
            .object({
              cellType: z.enum(["markdown", "code", "raw"]),
              cellId: z.string().min(1),
              content: nonBlankContentSchema,
              outputs: z.array(nonBlankContentSchema).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(MAX_NOTEBOOK_CELLS),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      kind: z.literal("code"),
      format: z.enum(["py", "ts", "js", "java", "cpp", "go", "rs", "sql"]),
      language: z.enum(["python", "typescript", "javascript", "java", "cpp", "go", "rust", "sql"]),
      content: nonBlankContentSchema,
    })
    .strict(),
]);

const notebookInputSchema = z.object({
  nbformat: z.literal(4),
  metadata: z
    .object({
      kernelspec: z.object({ language: z.string().optional() }).optional(),
      language_info: z.object({ name: z.string().optional() }).optional(),
    })
    .optional(),
  cells: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        cell_type: z.enum(["markdown", "code", "raw"]),
        source: z.union([z.string(), z.array(z.string()).max(MAX_NOTEBOOK_SOURCE_PARTS)]),
        outputs: z
          .array(
            z
              .object({
                output_type: z.enum(["stream", "error", "display_data", "execute_result"]),
                text: z.union([z.string(), z.array(z.string())]).optional(),
                ename: z.string().optional(),
                evalue: z.string().optional(),
                traceback: z.array(z.string()).optional(),
                data: z
                  .object({
                    "text/plain": z.union([z.string(), z.array(z.string())]).optional(),
                    "text/html": z.union([z.string(), z.array(z.string())]).optional(),
                  })
                  .passthrough()
                  .optional(),
              })
              .passthrough(),
          )
          .max(10_000)
          .optional(),
      }),
    )
    .max(MAX_NOTEBOOK_CELLS),
});

export type NativeSourceResult = z.infer<typeof nativeTextResultSchema>;

export class NativeTextError extends Error {
  readonly code = "native_input_rejected" as const;

  constructor() {
    super("native_input_rejected");
    this.name = "NativeTextError";
  }
}

function decodeUtf8(bytes: Uint8Array) {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new NativeTextError();
  }
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalized.includes("\0") || normalized.trim().length === 0) {
    throw new NativeTextError();
  }
  return normalized;
}

function parseStructuredText(extension: "json" | "yaml" | "yml" | "xml", content: string) {
  if (extension === "json") {
    const value = JSON.parse(content);
    if (
      value !== null &&
      typeof value === "object" &&
      (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)
    )
      throw new NativeTextError();
  } else if (extension === "yaml" || extension === "yml") {
    const document = parseDocument(content, {
      schema: "core",
      strict: true,
      uniqueKeys: true,
    });
    if (document.errors.length > 0 || document.warnings.length > 0) throw new NativeTextError();
    const value = document.toJSON();
    if (
      value !== null &&
      typeof value === "object" &&
      (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)
    )
      throw new NativeTextError();
  } else {
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(content)) throw new NativeTextError();
    if (XMLValidator.validate(content) !== true) throw new NativeTextError();
    if (!content.replaceAll(/<[^>]*>/g, "").trim()) throw new NativeTextError();
  }
  return nativeTextResultSchema.parse({
    schemaVersion: 1,
    kind: "structured_text",
    format: extension,
    content,
  });
}

function parseSubtitleSource(extension: "srt" | "vtt", content: string) {
  if (extension === "vtt" && !/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(content)) {
    throw new NativeTextError();
  }
  if (extension === "srt" && /^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(content)) {
    throw new NativeTextError();
  }
  const segments = parseSubtitles(content)
    .filter((node) => node.type === "cue")
    .map((node) => ({
      startMs: node.data.start,
      endMs: node.data.end,
      text: node.data.text.trim(),
    }));
  return nativeTextResultSchema.parse({
    schemaVersion: 1,
    kind: "subtitles",
    format: extension,
    segments,
  });
}

function parseNotebook(content: string) {
  const notebook = notebookInputSchema.parse(JSON.parse(content));
  let extractedBytes = 0;
  const cells: Array<{
    cellType: "markdown" | "code" | "raw";
    cellId: string;
    content: string;
    outputs?: string[];
  }> = [];
  for (const [cellIndex, cell] of notebook.cells.entries()) {
    const cellContent = (Array.isArray(cell.source) ? cell.source.join("") : cell.source).replace(
      /\r\n?/g,
      "\n",
    );
    if (cellContent.trim().length === 0) continue;
    const cellBytes = Buffer.byteLength(cellContent, "utf8");
    if (cellBytes > MAX_NOTEBOOK_CELL_BYTES) throw new NativeTextError();
    extractedBytes += cellBytes;
    if (extractedBytes > MAX_NATIVE_TEXT_SOURCE_FILE_BYTES) throw new NativeTextError();
    const outputs = (cell.outputs ?? []).flatMap((output) => {
      const join = (value: string | string[] | undefined) =>
        (Array.isArray(value) ? value.join("") : (value ?? "")).replace(/\r\n?/g, "\n").trim();
      const direct = join(output.text);
      if (direct) return [direct];
      if (output.output_type === "error") {
        const error = [output.ename, output.evalue, ...(output.traceback ?? [])]
          .filter(Boolean)
          .join("\n")
          .trim();
        return error ? [error] : [];
      }
      const plain = join(output.data?.["text/plain"]);
      if (plain) return [plain];
      const html = join(output.data?.["text/html"]);
      if (!html) return [];
      const safeText = htmlToText(html).trim();
      return safeText ? [safeText] : [];
    });
    const outputBytes = outputs.reduce((total, output) => total + Buffer.byteLength(output), 0);
    extractedBytes += outputBytes;
    if (extractedBytes > MAX_NATIVE_TEXT_SOURCE_FILE_BYTES) throw new NativeTextError();
    cells.push({
      cellType: cell.cell_type,
      cellId: cell.id ?? `generated-cell-${cellIndex + 1}`,
      content: cellContent,
      ...(outputs.length > 0 ? { outputs } : {}),
    });
  }
  const languageCandidate =
    notebook.metadata?.language_info?.name ?? notebook.metadata?.kernelspec?.language;
  const language = z.string().trim().min(1).max(64).safeParse(languageCandidate);
  return nativeTextResultSchema.parse({
    schemaVersion: 1,
    kind: "notebook",
    format: "ipynb",
    ...(language.success ? { language: language.data } : {}),
    cells,
  });
}

function cellText(cell: ExcelJS.Cell) {
  if (cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object" && "formula" in cell.value) {
    const result = cell.value.result;
    return result === null || result === undefined ? "" : String(result);
  }
  return cell.text;
}

function validateWorkbookArchive(bytes: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (error, archive) => {
      if (error || !archive) return reject(new NativeTextError());
      let entries = 0;
      let expandedBytes = 0;
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        entries += 1;
        expandedBytes += entry.uncompressedSize;
        const name = entry.fileName.replaceAll("\\", "/");
        const allowed =
          name === "[Content_Types].xml" ||
          name.startsWith("_rels/") ||
          name.startsWith("docProps/") ||
          name.startsWith("xl/");
        if (
          !allowed ||
          name.startsWith("/") ||
          name.split("/").includes("..") ||
          entries > MAX_XLSX_ENTRIES ||
          entry.uncompressedSize > MAX_XLSX_ENTRY_BYTES ||
          expandedBytes > MAX_XLSX_EXPANDED_BYTES
        ) {
          archive.close();
          reject(new NativeTextError());
          return;
        }
        archive.readEntry();
      });
      archive.on("end", resolve);
      archive.readEntry();
    });
  });
}

async function parseWorkbook(bytes: Uint8Array): Promise<NativeSourceResult> {
  await validateWorkbookArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  const input = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(input);
  let totalRows = 0;
  let totalCells = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    const rows: Array<{
      number: number;
      cells: Array<{ address: string; value: string; displayValue: string; formula?: string }>;
    }> = [];
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
      totalRows += 1;
      if (totalRows > MAX_XLSX_ROWS) throw new NativeTextError();
      const cells: Array<{
        address: string;
        value: string;
        displayValue: string;
        formula?: string;
      }> = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.isMerged && cell.master.address !== cell.address) return;
        const value = cellText(cell);
        const formula =
          typeof cell.value === "object" && cell.value !== null && "formula" in cell.value
            ? cell.value.formula
            : undefined;
        if (value || formula) {
          cells.push({
            address: cell.address,
            value,
            displayValue: cell.text,
            ...(formula ? { formula } : {}),
          });
        }
      });
      totalCells += cells.length;
      if (totalCells > MAX_XLSX_CELLS) throw new NativeTextError();
      if (cells.length > 0) rows.push({ number, cells });
    });
    const mergedRanges = sheet.model.merges;
    return { id: String(sheet.id), name: sheet.name, mergedRanges, rows };
  });
  return nativeTextResultSchema.parse({
    schemaVersion: 2,
    kind: "workbook",
    format: "xlsx",
    sheets,
  });
}

export function parseNativeSource(
  extension: Exclude<SourceNativeTextExtension, "xlsx">,
  bytes: Uint8Array,
): NativeSourceResult {
  if (bytes.byteLength > MAX_NATIVE_TEXT_SOURCE_FILE_BYTES) throw new NativeTextError();
  const content = decodeUtf8(bytes);
  try {
    switch (extension) {
      case "txt":
      case "md":
        return nativeTextResultSchema.parse({
          schemaVersion: 1,
          kind: "text",
          format: extension,
          content,
        });
      case "csv": {
        const rows = parse(content, {
          bom: true,
          max_record_size: MAX_CSV_RECORD_BYTES,
          relax_column_count: false,
          skip_empty_lines: true,
        });
        return nativeTextResultSchema.parse({
          schemaVersion: 1,
          kind: "table",
          format: "csv",
          rows,
        });
      }
      case "json":
      case "yaml":
      case "yml":
      case "xml":
        return parseStructuredText(extension, content);
      case "html": {
        if (!htmlToText(content).trim()) throw new NativeTextError();
        return nativeTextResultSchema.parse({
          schemaVersion: 1,
          kind: "structured_text",
          format: "html",
          content,
        });
      }
      case "srt":
      case "vtt":
        return parseSubtitleSource(extension, content);
      case "ipynb":
        return parseNotebook(content);
      case "py":
      case "ts":
      case "js":
      case "java":
      case "cpp":
      case "go":
      case "rs":
      case "sql":
        return nativeTextResultSchema.parse({
          schemaVersion: 1,
          kind: "code",
          format: extension,
          language: codeLanguages[extension],
          content,
        });
    }
  } catch (error) {
    if (error instanceof NativeTextError) throw error;
    throw new NativeTextError();
  }
}

export async function parseNativeSourceFile(
  extension: SourceNativeTextExtension,
  bytes: Uint8Array,
): Promise<NativeSourceResult> {
  if (extension !== "xlsx") return parseNativeSource(extension, bytes);
  if (bytes.byteLength > 50 * 1024 * 1024) throw new NativeTextError();
  try {
    return await parseWorkbook(bytes);
  } catch {
    throw new NativeTextError();
  }
}
