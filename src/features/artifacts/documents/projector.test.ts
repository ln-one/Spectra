import { describe, expect, test } from "vitest";
import { teachingDocumentRevisionContentSchema } from "./contract";
import { projectTeachingDocument } from "./projector";

describe("teaching document projection", () => {
  test.each([
    "**unclosed emphasis",
    "```ts\nconst oneLine = 'still useful'",
    `<script>alert("escaped")</script>`,
    `# Code\n\n\`\`\`py\nfrom module import ${"Symbol,".repeat(100)}\n\`\`\``,
  ])("publishes every non-empty model output: %s", (rawOutput) => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput,
      requestedTitle: "Fallback title",
    });
    expect(teachingDocumentRevisionContentSchema.parse(projection.revision)).toEqual(
      projection.revision,
    );
    expect(projection.revision.schemaVersion).toBe(2);
    expect(projection.rawOutput).toBe(rawOutput);
  });

  test("publishes provider interruption as a ready-compatible partial revision", () => {
    const projection = projectTeachingDocument({
      outcome: "partial",
      rawOutput: "# Visible\n\nExisting content",
      requestedTitle: "Fallback",
    });
    expect(projection.warnings).toContain("partial_generation");
    expect(projection.revision.generation.outcome).toBe("partial");
  });

  test("projects Markdown thematic breaks as horizontal rules", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "# Sections\n\nBefore\n\n---\n\nAfter",
      requestedTitle: "Fallback",
    });

    expect(projection.revision.document.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "horizontalRule",
      "paragraph",
    ]);
  });

  test.each([
    ["standard GFM", "阶段 | 时间跨度\n--- | ---\n批处理时代 | 1950s–1960s\n命令行 | 1970s"],
    ["implicit pipe table", "阶段 | 时间跨度\n批处理时代 | 1950s–1960s\n命令行 | 1970s"],
  ])("projects %s as a real table without changing the source", (_label, rawOutput) => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput,
      requestedTitle: "HCI history",
    });

    const table = projection.revision.document.content.find((node) => node.type === "table");
    expect(table?.content).toHaveLength(3);
    expect(table?.content[0]?.content.map((cell) => cell.type)).toEqual([
      "tableHeader",
      "tableHeader",
    ]);
    expect(projection.revision.sourceMarkdown).toBe(rawOutput);
  });

  test("does not reinterpret an isolated pipe expression as a table", () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "Use left | right in this sentence.",
      requestedTitle: "Pipes",
    });
    expect(projection.revision.document.content.some((node) => node.type === "table")).toBe(false);
  });

  test("does not normalize pipe rows inside a longer matching code fence", () => {
    const rawOutput = "````md\na | b\n```\ne | f\ng | h\n````";
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput,
      requestedTitle: "Code",
    });
    const code = projection.revision.document.content.find((node) => node.type === "codeBlock");
    const text = code?.content?.map((node) => (node.type === "text" ? node.text : "\n")).join("");
    expect(text).toBe("a | b\n```\ne | f\ng | h");
    expect(text).not.toContain("| --- | --- |");
  });

  test("rejects empty output instead of publishing a fallback revision", () => {
    expect(() =>
      projectTeachingDocument({
        outcome: "complete",
        rawOutput: " \n\t ",
        requestedTitle: "Fallback",
      }),
    ).toThrow("teaching_document_invalid_output");
  });
});
