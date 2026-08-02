import { describe, expect, it } from "vitest";
import {
  teachingDocumentEditorJsonToMarkdown,
  teachingDocumentMarkdownBlocks,
  teachingDocumentMarkdownPage,
} from "./markdown";
import { projectTeachingDocument } from "./projector";

const content = {
  document: {
    content: [
      {
        attrs: { id: "heading", level: 2 },
        content: [{ text: "Overview", type: "text" as const }],
        type: "heading" as const,
      },
      {
        attrs: { id: "paragraph" },
        content: [{ text: "A concise explanation.", type: "text" as const }],
        type: "paragraph" as const,
      },
      {
        attrs: { id: "list" },
        content: [
          {
            attrs: { id: "item" },
            content: [
              {
                attrs: { id: "item-paragraph" },
                content: [{ text: "First point", type: "text" as const }],
                type: "paragraph" as const,
              },
            ],
            type: "listItem" as const,
          },
        ],
        type: "bulletList" as const,
      },
    ],
    type: "doc" as const,
  },
  generation: { outcome: "complete" as const, rawOutput: "Document title", warnings: [] },
  schemaVersion: 2 as const,
  sourceMarkdown: "Document title",
  title: "Document title",
};

describe("teachingDocumentMarkdownPage", () => {
  it("converts controlled Tiptap nodes into readable Markdown blocks", () => {
    expect(teachingDocumentMarkdownBlocks(content)).toEqual([
      "## Overview",
      "A concise explanation.",
      "- First point",
    ]);
  });

  it("pages only at block boundaries", () => {
    const first = teachingDocumentMarkdownPage(content, 0, 20);
    expect(first).toEqual({ markdown: "## Overview", nextCursor: 1 });
    expect(teachingDocumentMarkdownPage(content, first.nextCursor ?? 0, 100)).toEqual({
      markdown: "A concise explanation.\n\n- First point",
      nextCursor: null,
    });
  });

  it("preserves ordered steps, quotations, and fenced code", () => {
    expect(
      teachingDocumentMarkdownBlocks({
        document: {
          content: [
            {
              attrs: { id: "steps", start: 1, type: null },
              content: [
                {
                  attrs: { id: "step" },
                  content: [
                    {
                      attrs: { id: "step-text" },
                      content: [{ text: "Install", type: "text" }],
                      type: "paragraph",
                    },
                  ],
                  type: "listItem",
                },
              ],
              type: "orderedList",
            },
            {
              attrs: { id: "quote" },
              content: [
                {
                  attrs: { id: "quote-text" },
                  content: [{ text: "Verify first.", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "blockquote",
            },
            {
              attrs: { id: "code", language: "ts" },
              content: [{ text: "const ready = true;", type: "text" }],
              type: "codeBlock",
            },
          ],
          type: "doc",
        },
        generation: { outcome: "complete", rawOutput: "Advanced", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "Advanced",
        title: "Advanced",
      }),
    ).toEqual(["1. Install", "> Verify first.", "```ts\nconst ready = true;\n```"]);
  });

  it("keeps long blocks intact while staying near the default page limit", () => {
    const longContent = {
      ...content,
      document: {
        ...content.document,
        content: Array.from({ length: 4 }, (_, index) => ({
          attrs: { id: `paragraph-${index}` },
          content: [{ text: String(index).repeat(4_000), type: "text" as const }],
          type: "paragraph" as const,
        })),
      },
    };

    const first = teachingDocumentMarkdownPage(longContent);
    expect(first.markdown).toHaveLength(8_002);
    expect(first.nextCursor).toBe(2);
    expect(teachingDocumentMarkdownPage(longContent, first.nextCursor ?? 0)).toEqual({
      markdown: `${"2".repeat(4_000)}\n\n${"3".repeat(4_000)}`,
      nextCursor: null,
    });
  });

  it("round-trips fenced code containing triple backticks", () => {
    const code = "const fence = ```;\nconsole.log(`value`);";
    const markdown = teachingDocumentEditorJsonToMarkdown(
      {
        content: [
          {
            attrs: { language: "ts" },
            content: [{ text: code, type: "text" }],
            type: "codeBlock",
          },
        ],
        type: "doc",
      },
      "Backticks",
    );
    expect(markdown).toContain(`\`\`\`\`ts\n${code}\n\`\`\`\``);

    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: markdown,
      requestedTitle: "Fallback",
    });
    const codeBlock = projection.revision.document.content.find(
      (node) => node.type === "codeBlock",
    );
    expect(
      codeBlock?.content?.map((node) => (node.type === "text" ? node.text : "\n")).join(""),
    ).toBe(code);
  });

  it("round-trips inline code containing backticks", () => {
    const markdown = teachingDocumentEditorJsonToMarkdown(
      {
        content: [
          {
            content: [{ marks: [{ type: "code" }], text: "before`after", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      },
      "Inline",
    );
    expect(markdown).toContain("``before`after``");

    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: markdown,
      requestedTitle: "Fallback",
    });
    const paragraph = projection.revision.document.content.find(
      (node) => node.type === "paragraph",
    );
    expect(paragraph?.content).toEqual([
      { marks: [{ type: "code" }], text: "before`after", type: "text" },
    ]);
  });

  it("serializes native Tiptap math nodes back to Markdown delimiters", () => {
    expect(
      teachingDocumentEditorJsonToMarkdown(
        {
          content: [
            {
              content: [
                { text: "Posterior: ", type: "text" },
                { attrs: { latex: String.raw`P(c\mid x)` }, type: "inlineMath" },
              ],
              type: "paragraph",
            },
            {
              attrs: { latex: String.raw`\frac{P(x\mid c)P(c)}{P(x)}` },
              type: "blockMath",
            },
          ],
          type: "doc",
        },
        "Bayes",
      ),
    ).toBe(
      String.raw`# Bayes

Posterior: $P(c\mid x)$

$$
\frac{P(x\mid c)P(c)}{P(x)}
$$`,
    );
  });

  it("round-trips thematic breaks without degrading them to paragraph text", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "# Sections\n\nBefore\n\n---\n\nAfter",
      requestedTitle: "Fallback",
    });

    expect(teachingDocumentMarkdownBlocks(projection.revision)).toEqual([
      "# Sections",
      "Before",
      "---",
      "After",
    ]);
    expect(
      teachingDocumentEditorJsonToMarkdown(
        { content: [{ type: "horizontalRule" }], type: "doc" },
        "Sections",
      ),
    ).toBe("# Sections\n\n---");
  });

  it("round-trips real tables instead of degrading them to fenced code", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "阶段 | 时间跨度\n--- | ---\n批处理时代 | 1950s–1960s",
      requestedTitle: "HCI history",
    });

    expect(teachingDocumentMarkdownBlocks(projection.revision)).toEqual([
      "| 阶段 | 时间跨度 |\n| --- | --- |\n| 批处理时代 | 1950s–1960s |",
    ]);
    expect(
      teachingDocumentEditorJsonToMarkdown(
        { content: projection.revision.document.content, type: "doc" },
        "HCI history",
      ),
    ).toContain("| 阶段 | 时间跨度 |\n| --- | --- |\n| 批处理时代 | 1950s–1960s |");
  });

  it("keeps legitimate language-less pipe code as fenced code", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "```\ncat file | grep x\nps aux | head\n```",
      requestedTitle: "Shell",
    });

    expect(teachingDocumentMarkdownBlocks(projection.revision)).toEqual([
      "```\ncat file | grep x\nps aux | head\n```",
    ]);
  });

  it("keeps generic pipe data as fenced code", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "Body",
      requestedTitle: "Pipes",
    });
    projection.revision.document.content = [
      {
        attrs: { id: "generic-code", language: null },
        content: [{ text: "a | b\nc | d\ne | f", type: "text" }],
        type: "codeBlock",
      },
    ];

    expect(teachingDocumentMarkdownBlocks(projection.revision)[0]).toBe(
      "```\na | b\nc | d\ne | f\n```",
    );
  });

  it("preserves multiple table-cell paragraphs as hard breaks after save and reload", () => {
    const markdown = teachingDocumentEditorJsonToMarkdown(
      {
        content: [
          {
            content: [
              {
                content: [
                  {
                    content: [{ content: [{ text: "Header", type: "text" }], type: "paragraph" }],
                    type: "tableHeader",
                  },
                ],
                type: "tableRow",
              },
              {
                content: [
                  {
                    content: [
                      { content: [{ text: "A", type: "text" }], type: "paragraph" },
                      { content: [{ text: "B", type: "text" }], type: "paragraph" },
                    ],
                    type: "tableCell",
                  },
                ],
                type: "tableRow",
              },
            ],
            type: "table",
          },
        ],
        type: "doc",
      },
      "Table",
    );
    expect(markdown).toContain("| A<br>B |");

    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: markdown,
      requestedTitle: "Table",
    });
    const table = projection.revision.document.content.find((node) => node.type === "table");
    expect(table?.content[1]?.content[0]?.content[0]?.content).toEqual([
      { text: "A", type: "text" },
      { type: "hardBreak" },
      { text: "B", type: "text" },
    ]);
    expect(teachingDocumentMarkdownBlocks(projection.revision)[1]).toContain("| A<br>B |");
  });
});
