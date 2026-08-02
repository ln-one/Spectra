import "server-only";

import { Buffer } from "node:buffer";
import { getNodePath, getNodeValue, parseTree } from "jsonc-parser";
import { type DefaultTreeAdapterMap, parse as parseHtml } from "parse5";
import { SaxesParser } from "saxes";
import { isMap, isSeq, type Pair, parseDocument, type Node as YamlNode } from "yaml";
import { z } from "zod";
import {
  sourceAudioAnalysisSchema,
  sourceVideoAnalysisSchema,
} from "@/features/sources/ingestion/media-result";
import { nativeTextResultSchema } from "@/features/sources/ingestion/native-text";
import type { EvidenceLocator } from "../contracts";
import { markdownProjectableBlocks, type ProjectableBlock } from "../projection";
import type { CanonicalSourceRepresentation } from "./contracts";
import { representation, spreadsheetColumn, tableContent } from "./shared";

const sourceJsonResultSchema = z.union([
  nativeTextResultSchema,
  sourceAudioAnalysisSchema,
  sourceVideoAnalysisSchema,
]);

function exactTextBlock(
  exactText: string,
  locator: EvidenceLocator,
  input: Partial<ProjectableBlock> = {},
): ProjectableBlock {
  return {
    kind: "paragraph",
    exactText,
    indexText: exactText,
    locator,
    content: { kind: "exact_text", text: exactText },
    fidelity: "source",
    ...input,
  };
}

function textBlocks(content: string, kind: "prose" | "code") {
  const blocks: ProjectableBlock[] = [];
  const pattern = kind === "code" ? /(?:^|\n)(?=\S)/g : /\S(?:[\s\S]*?)(?=\n\s*\n|$)/g;
  if (kind === "code") {
    const lines = content.split("\n");
    let offset = 0;
    for (let startLine = 0; startLine < lines.length; startLine += 80) {
      const selected = lines.slice(startLine, startLine + 80).join("\n");
      if (!selected.trim()) {
        offset += selected.length + 1;
        continue;
      }
      const startByte = Buffer.byteLength(content.slice(0, offset), "utf8");
      const end = offset + selected.length;
      blocks.push(
        exactTextBlock(
          selected,
          {
            kind: "code_range",
            startByte,
            endByte: Buffer.byteLength(content.slice(0, end), "utf8"),
            startLine: startLine + 1,
            endLine: Math.min(lines.length, startLine + 80),
          },
          { kind: "code" },
        ),
      );
      offset = end + 1;
    }
    return blocks;
  }
  for (const match of content.matchAll(pattern)) {
    const text = match[0];
    const start = match.index;
    if (start === undefined || !text.trim()) continue;
    blocks.push(exactTextBlock(text, { kind: "text_range", start, end: start + text.length }));
  }
  return blocks;
}

function pointer(path: Array<string | number>) {
  return `/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function jsonBlocks(content: string) {
  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const root = parseTree(content, errors, { allowTrailingComma: false, disallowComments: true });
  if (!root || errors.length > 0) throw new Error("knowledge_source_result_invalid");
  const candidates =
    root.type === "object" || root.type === "array" ? (root.children ?? []) : [root];
  return candidates.map((node) => {
    const valueNode = node.type === "property" ? node.children?.[1] : node;
    const selected = valueNode ?? node;
    const path = getNodePath(selected);
    const text = content.slice(node.offset, node.offset + node.length);
    return exactTextBlock(
      text,
      {
        kind: "structured_path",
        dialect: "json-pointer",
        path: pointer(path),
        start: node.offset,
        end: node.offset + node.length,
      },
      {
        kind: "structured_node",
        indexText: `${pointer(path)}\n${JSON.stringify(getNodeValue(selected))}`,
      },
    );
  });
}

function yamlPath(path: Array<string | number>) {
  return path.length === 0
    ? "$"
    : `$${path
        .map((part) => (typeof part === "number" ? `[${part}]` : `[${JSON.stringify(part)}]`))
        .join("")}`;
}

function yamlBlocks(content: string) {
  const document = parseDocument(content, { keepSourceTokens: true, schema: "core", strict: true });
  if (document.errors.length > 0) throw new Error("knowledge_source_result_invalid");
  const blocks: ProjectableBlock[] = [];
  const visit = (node: YamlNode | null | undefined, path: Array<string | number>) => {
    if (!node) return;
    if (isMap(node)) {
      for (const pair of node.items as Pair[]) {
        const key = String(pair.key ?? "");
        visit(pair.value as YamlNode | null, [...path, key]);
      }
      return;
    }
    if (isSeq(node)) {
      node.items.forEach((item, index) => {
        visit(item as YamlNode | null, [...path, index]);
      });
      return;
    }
    const range = node.range;
    if (!range) return;
    const text = content.slice(range[0], range[1]);
    blocks.push(
      exactTextBlock(
        text,
        {
          kind: "structured_path",
          dialect: "yaml-path",
          path: yamlPath(path),
          start: range[0],
          end: range[1],
        },
        { kind: "structured_node", indexText: `${yamlPath(path)}\n${text}` },
      ),
    );
  };
  visit(document.contents as YamlNode | null, []);
  return blocks;
}

function htmlBlocks(content: string) {
  const document = parseHtml(content, { sourceCodeLocationInfo: true });
  const blocks: ProjectableBlock[] = [];
  const forbidden = new Set(["script", "style", "noscript", "template"]);
  const visit = (node: DefaultTreeAdapterMap["node"], path: string, blocked: boolean) => {
    const element = node as DefaultTreeAdapterMap["element"];
    const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
    const nextBlocked = blocked || forbidden.has(tagName);
    if (node.nodeName === "#text" && !nextBlocked) {
      const textNode = node as DefaultTreeAdapterMap["textNode"];
      const location = textNode.sourceCodeLocation;
      const text = textNode.value;
      if (location && text.trim()) {
        blocks.push(
          exactTextBlock(
            content.slice(location.startOffset, location.endOffset),
            {
              kind: "structured_path",
              dialect: "html-path",
              path,
              start: location.startOffset,
              end: location.endOffset,
            },
            { kind: "structured_node", indexText: text },
          ),
        );
      }
    }
    const parent = node as DefaultTreeAdapterMap["parentNode"];
    if (!Array.isArray(parent.childNodes)) return;
    const counts = new Map<string, number>();
    for (const child of parent.childNodes) {
      const name = child.nodeName;
      const count = (counts.get(name) ?? 0) + 1;
      counts.set(name, count);
      visit(child, `${path}/${name}[${count}]`, nextBlocked);
    }
  };
  visit(document, "", false);
  return blocks;
}

function xmlBlocks(content: string) {
  const parser = new SaxesParser({ xmlns: true });
  const blocks: ProjectableBlock[] = [];
  const stack: Array<{ path: string; childCounts: Map<string, number> }> = [];
  parser.on("opentag", (tag) => {
    const parent = stack.at(-1);
    const count = (parent?.childCounts.get(tag.name) ?? 0) + 1;
    parent?.childCounts.set(tag.name, count);
    const path = `${parent?.path ?? ""}/${tag.name}[${count}]`;
    stack.push({ path, childCounts: new Map() });
  });
  parser.on("text", (text) => {
    const current = stack.at(-1);
    if (!current || !text.trim()) return;
    blocks.push(
      exactTextBlock(
        text,
        { kind: "structured_path", dialect: "xml-path", path: current.path },
        { kind: "structured_node" },
      ),
    );
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(content).close();
  return blocks;
}

function jsonRepresentation(bytes: Uint8Array): CanonicalSourceRepresentation {
  const result = sourceJsonResultSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  switch (result.kind) {
    case "text":
      return representation(
        result.format,
        "prose",
        result.format === "md" ? "markdown-v2" : "plain-text-v2",
        result.format === "md"
          ? markdownProjectableBlocks(result.content)
          : textBlocks(result.content, "prose"),
      );
    case "code":
      return representation(
        result.format,
        "code",
        "code-range-v2",
        textBlocks(result.content, "code"),
      );
    case "structured_text": {
      const blocks =
        result.format === "json"
          ? jsonBlocks(result.content)
          : result.format === "yaml" || result.format === "yml"
            ? yamlBlocks(result.content)
            : result.format === "html"
              ? htmlBlocks(result.content)
              : xmlBlocks(result.content);
      const adapterId =
        result.format === "json"
          ? "json-ast-v2"
          : result.format === "yaml" || result.format === "yml"
            ? "yaml-cst-v2"
            : `${result.format}-source-v2`;
      return representation(result.format, "structured", adapterId, blocks);
    }
    case "table": {
      const blocks = result.rows.map((row, index) => {
        const cells = row.map((value, column) => ({
          address: `${spreadsheetColumn(column)}${index + 1}`,
          value,
        }));
        const text = row.join("\t");
        return {
          kind: "table" as const,
          exactText: text,
          indexText: text,
          locator: {
            kind: "grid_range" as const,
            sheetId: "csv",
            range: `A${index + 1}:${cells.at(-1)?.address ?? `A${index + 1}`}`,
          },
          content: tableContent(cells),
          fidelity: "source" as const,
        };
      });
      return representation("csv", "grid", "csv-grid-v2", blocks);
    }
    case "workbook": {
      const blocks = result.sheets.flatMap((sheet) =>
        sheet.rows.map((row) => {
          const text = row.cells
            .map((cell) => {
              const rendered = cell.displayValue || cell.value;
              return `${cell.address}: ${rendered}${cell.formula ? ` [=${cell.formula}]` : ""}`;
            })
            .join("\t");
          return {
            kind: "table" as const,
            headingPath: [sheet.name],
            exactText: text,
            indexText: `${sheet.name}\n${text}`,
            locator: {
              kind: "grid_range" as const,
              sheetId: sheet.id,
              range: `${row.cells[0]?.address ?? `A${row.number}`}:${row.cells.at(-1)?.address ?? `A${row.number}`}`,
            },
            content: tableContent(row.cells),
            fidelity: "source" as const,
          };
        }),
      );
      return representation("xlsx", "grid", "xlsx-grid-v2", blocks);
    }
    case "subtitles":
      return representation(
        result.format,
        "timed-text",
        "subtitle-v2",
        result.segments.map((segment, index) => ({
          kind: "cue",
          exactText: segment.text,
          locator: {
            kind: "cue_range",
            cueIds: [`cue-${index + 1}`],
            startMs: segment.startMs,
            endMs: segment.endMs,
          },
          content: { kind: "timed_transcript", text: segment.text, fidelity: "source-caption" },
          fidelity: "source",
        })),
      );
    case "notebook":
      return representation(
        "ipynb",
        "notebook",
        "nbformat-v2",
        result.cells.flatMap((cell) => {
          let cursor = 0;
          return [cell.content, ...(cell.outputs ?? [])].map((content, index) => {
            const start = cursor;
            const end = start + content.length;
            cursor = end + 2;
            return {
              kind: "notebook_cell" as const,
              headingPath: [cell.cellType, index === 0 ? "source" : `output-${index}`],
              exactText: content,
              locator: {
                kind: "notebook_cell" as const,
                cellId: cell.cellId,
                start,
                end,
              },
              content: { kind: "exact_text" as const, text: content },
              fidelity: "source" as const,
            };
          });
        }),
      );
    case "audio":
    case "video":
      return representation(
        result.format,
        "timed-media",
        "media-segment-v2",
        result.segments.map((segment) => ({
          kind: "media_segment",
          exactText: segment.description,
          locator: { kind: "media_range", startMs: segment.startMs, endMs: segment.endMs },
          content: {
            kind: "timed_transcript",
            text: segment.description,
            fidelity: "model-description",
          },
          fidelity: "model-description",
        })),
      );
    default:
      result satisfies never;
      throw new Error("knowledge_source_result_unsupported");
  }
}

export async function parseNativeOrMediaRepresentation(bytes: Uint8Array) {
  return jsonRepresentation(bytes);
}
