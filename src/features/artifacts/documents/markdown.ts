import type { TeachingDocumentRevisionContent } from "./contract";
import { teachingDocumentRevisionContentSchema } from "./contract";
import type {
  TeachingDocumentBulletListV2,
  TeachingDocumentInlineNodeV2,
  TeachingDocumentListItemV2,
  TeachingDocumentOrderedListV2,
  TeachingDocumentRevisionContentV2,
  TeachingDocumentTableV2,
} from "./revision-v2";

const DEFAULT_PAGE_CHARACTER_LIMIT = 12_000;

function longestBacktickRun(value: string) {
  return Math.max(0, ...(value.match(/`+/g)?.map((run) => run.length) ?? []));
}

function inlineCode(value: string) {
  const delimiter = "`".repeat(Math.max(1, longestBacktickRun(value) + 1));
  const needsPadding =
    value.startsWith("`") ||
    value.endsWith("`") ||
    (value.startsWith(" ") && value.endsWith(" ") && value.trim().length > 0);
  const padding = needsPadding ? " " : "";
  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

function fencedCode(value: string, language = "") {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(value) + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function markedText(node: Extract<TeachingDocumentInlineNodeV2, { type: "text" }>) {
  let value = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "code") value = inlineCode(value);
    else if (mark.type === "bold") value = `**${value}**`;
    else if (mark.type === "italic") value = `*${value}*`;
    else if (mark.type === "strike") value = `~~${value}~~`;
    else if (mark.type === "link") value = `[${value}](${mark.attrs.href})`;
  }
  return value;
}

function inlineMarkdown(content: readonly TeachingDocumentInlineNodeV2[] | undefined) {
  return (
    content?.map((node) => (node.type === "hardBreak" ? "  \n" : markedText(node))).join("") ?? ""
  );
}

type ListV2 = TeachingDocumentBulletListV2 | TeachingDocumentOrderedListV2;

function listItemMarkdown(item: TeachingDocumentListItemV2, marker: string, depth: number) {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  let emittedMarker = false;
  for (const child of item.content) {
    if (child.type === "paragraph") {
      const text = inlineMarkdown(child.content);
      if (!emittedMarker) {
        lines.push(`${indent}${marker} ${text}`);
        emittedMarker = true;
      } else {
        lines.push(`${indent}  ${text}`);
      }
    } else {
      if (!emittedMarker) {
        lines.push(`${indent}${marker}`);
        emittedMarker = true;
      }
      lines.push(listMarkdown(child, depth + 1));
    }
  }
  if (!emittedMarker) lines.push(`${indent}${marker}`);
  return lines.join("\n");
}

function listMarkdown(list: ListV2, depth = 0) {
  return list.content
    .map((item, index) =>
      listItemMarkdown(
        item,
        list.type === "orderedList" ? `${list.attrs.start + index}.` : "-",
        depth,
      ),
    )
    .join("\n");
}

function tableCellMarkdown(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("  \n", "<br>")
    .replaceAll("\n", "<br>");
}

function tableMarkdown(table: TeachingDocumentTableV2) {
  const rows = table.content.map((row) =>
    row.content.map((cell) =>
      tableCellMarkdown(cell.content.map((item) => inlineMarkdown(item.content)).join("  \n")),
    ),
  );
  const width = Math.max(1, ...rows.map((row) => row.length));
  const rowMarkdown = (row: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  const header = rows[0] ?? [];
  return [
    rowMarkdown(header),
    rowMarkdown(Array.from({ length: width }, () => "---")),
    ...rows.slice(1).map(rowMarkdown),
  ].join("\n");
}

function revisionMarkdownBlocks(content: TeachingDocumentRevisionContentV2) {
  return content.document.content.map((node) => {
    if (node.type === "heading") {
      return `${"#".repeat(node.attrs.level)} ${inlineMarkdown(node.content)}`;
    }
    if (node.type === "paragraph") return inlineMarkdown(node.content);
    if (node.type === "blockquote") {
      return node.content
        .map((paragraph) => `> ${inlineMarkdown(paragraph.content).replaceAll("\n", "\n> ")}`)
        .join("\n> \n");
    }
    if (node.type === "codeBlock") {
      const text = inlineMarkdown(node.content).replaceAll("  \n", "\n");
      return fencedCode(text, node.attrs.language ?? "");
    }
    if (node.type === "horizontalRule") return "---";
    if (node.type === "table") return tableMarkdown(node);
    return listMarkdown(node);
  });
}

export function teachingDocumentMarkdownBlocks(input: TeachingDocumentRevisionContent) {
  const content = teachingDocumentRevisionContentSchema.parse(input);
  return revisionMarkdownBlocks(content);
}

function editorRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function editorChildren(value: unknown) {
  const content = editorRecord(value)?.content;
  return Array.isArray(content) ? content : [];
}

function editorInlineMarkdown(value: unknown): string {
  const node = editorRecord(value);
  if (!node) return "";
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "inlineMath") {
    const attrs = editorRecord(node.attrs);
    return typeof attrs?.latex === "string" ? `$${attrs.latex}$` : "";
  }
  if (node.type === "text") {
    let text = typeof node.text === "string" ? node.text : "";
    const marks = Array.isArray(node.marks) ? node.marks : [];
    for (const candidate of marks) {
      const mark = editorRecord(candidate);
      if (mark?.type === "code") text = inlineCode(text);
      else if (mark?.type === "bold") text = `**${text}**`;
      else if (mark?.type === "italic") text = `*${text}*`;
      else if (mark?.type === "strike") text = `~~${text}~~`;
      else if (mark?.type === "link") {
        const attrs = editorRecord(mark.attrs);
        const href = typeof attrs?.href === "string" ? attrs.href : null;
        if (href && /^(?:https?:|mailto:|#)/i.test(href)) text = `[${text}](${href})`;
      }
    }
    return text;
  }
  return editorChildren(node).map(editorInlineMarkdown).join("");
}

function editorListMarkdown(value: unknown, depth = 0): string {
  const node = editorRecord(value);
  const ordered = node?.type === "orderedList";
  const attrs = editorRecord(node?.attrs);
  const start = typeof attrs?.start === "number" ? Math.max(1, Math.trunc(attrs.start)) : 1;
  return editorChildren(node)
    .map((item, index) => {
      const marker = ordered ? `${start + index}.` : "-";
      const indent = "  ".repeat(depth);
      let firstLine = `${indent}${marker}`;
      const nested: string[] = [];
      for (const child of editorChildren(item)) {
        const childType = editorRecord(child)?.type;
        if (childType === "bulletList" || childType === "orderedList") {
          nested.push(editorListMarkdown(child, depth + 1));
        } else {
          const text = editorInlineMarkdown(child);
          firstLine += firstLine === `${indent}${marker}` ? ` ${text}` : `\n${indent}  ${text}`;
        }
      }
      return [firstLine, ...nested].join("\n");
    })
    .join("\n");
}

function editorTableMarkdown(value: unknown) {
  const rows = editorChildren(value).map((row) =>
    editorChildren(row).map((cell) =>
      tableCellMarkdown(editorChildren(cell).map(editorInlineMarkdown).join("  \n")),
    ),
  );
  const width = Math.max(1, ...rows.map((row) => row.length));
  const rowMarkdown = (row: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  return [
    rowMarkdown(rows[0] ?? []),
    rowMarkdown(Array.from({ length: width }, () => "---")),
    ...rows.slice(1).map(rowMarkdown),
  ].join("\n");
}

function editorBlockMarkdown(value: unknown): string {
  const node = editorRecord(value);
  if (!node) return "";
  if (node.type === "heading") {
    const attrs = editorRecord(node.attrs);
    const level =
      typeof attrs?.level === "number" ? Math.min(3, Math.max(1, Math.trunc(attrs.level))) : 2;
    return `${"#".repeat(level)} ${editorInlineMarkdown(node)}`;
  }
  if (node.type === "paragraph") return editorInlineMarkdown(node);
  if (node.type === "blockquote") {
    return editorChildren(node)
      .map((child) => `> ${editorInlineMarkdown(child).replaceAll("\n", "\n> ")}`)
      .join("\n> \n");
  }
  if (node.type === "codeBlock") {
    const attrs = editorRecord(node.attrs);
    const language = typeof attrs?.language === "string" ? attrs.language : "";
    return fencedCode(editorInlineMarkdown(node).replaceAll("  \n", "\n"), language);
  }
  if (node.type === "horizontalRule") return "---";
  if (node.type === "blockMath") {
    const attrs = editorRecord(node.attrs);
    return typeof attrs?.latex === "string" ? `$$\n${attrs.latex}\n$$` : "";
  }
  if (node.type === "table") return editorTableMarkdown(node);
  if (node.type === "bulletList" || node.type === "orderedList") {
    return editorListMarkdown(node);
  }
  return editorInlineMarkdown(node);
}

export function teachingDocumentEditorJsonToMarkdown(document: unknown, title: string) {
  const body = editorChildren(document).map(editorBlockMarkdown).filter(Boolean).join("\n\n");
  return [`# ${title.trim() || "Untitled document"}`, body].filter(Boolean).join("\n\n");
}

export function teachingDocumentRevisionToMarkdown(input: unknown) {
  const content = teachingDocumentRevisionContentSchema.parse(input);
  if (content.schemaVersion === 2) {
    return teachingDocumentEditorJsonToMarkdown(content.document, content.title);
  }
  return [`# ${content.title}`, ...teachingDocumentMarkdownBlocks(content)]
    .filter(Boolean)
    .join("\n\n");
}

export function teachingDocumentMarkdownPage(
  input: TeachingDocumentRevisionContent,
  cursor = 0,
  characterLimit = DEFAULT_PAGE_CHARACTER_LIMIT,
) {
  const blocks = teachingDocumentMarkdownBlocks(input);
  const normalizedCursor = Math.min(Math.max(0, Math.trunc(cursor)), blocks.length);
  const selected: string[] = [];
  let characterCount = 0;
  let index = normalizedCursor;

  while (index < blocks.length) {
    const block = blocks[index] ?? "";
    const separatorLength = selected.length > 0 ? 2 : 0;
    if (selected.length > 0 && characterCount + separatorLength + block.length > characterLimit) {
      break;
    }
    selected.push(block);
    characterCount += separatorLength + block.length;
    index += 1;
  }

  return {
    markdown: selected.join("\n\n"),
    nextCursor: index < blocks.length ? index : null,
  };
}
