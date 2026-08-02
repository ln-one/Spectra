import { describe, expect, test } from "vitest";
import { fromBufferPromise } from "yauzl";
import { docxFilename, teachingDocumentToDocx } from "./export";
import { finalizeTeachingDocumentDraft } from "./finalize";
import { projectTeachingDocument } from "./projector";

async function zipEntryText(buffer: Buffer, fileName: string) {
  const zip = await fromBufferPromise(buffer);
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== fileName) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    }
  } finally {
    zip.close();
  }
  throw new Error(`Missing DOCX entry: ${fileName}`);
}

describe("teaching document DOCX export", () => {
  test("uses the official Tiptap exporter for deterministic OOXML packaging", async () => {
    const content = finalizeTeachingDocumentDraft({
      blocks: [
        { kind: "heading", level: 2, text: "概念" },
        { kind: "paragraph", text: "正文" },
        { kind: "bullet", text: "要点一" },
        { kind: "bullet", text: "要点二" },
      ],
      title: "TCP/IP：入门",
    });
    const buffer = await teachingDocumentToDocx(content);

    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(docxFilename(content.title)).toBe("TCP_IP：入门.docx");
  });

  test("exports tolerant v2 Markdown with marks, links, and multiline code", async () => {
    const projection = projectTeachingDocument({
      outcome: "partial",
      rawOutput:
        "# 标题\n\n**粗体**、*斜体*和[链接](https://example.com)\n\n```ts\nconst a = 1;\nconst b = 2;\n```",
      requestedTitle: "回退标题",
    });

    await expect(teachingDocumentToDocx(projection.revision)).resolves.toEqual(
      expect.objectContaining({ length: expect.any(Number) }),
    );
  });

  test("exports inline and list-nested block LaTeX as native Word equations", async () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: String.raw`# Bayes

Prior: $P(c)$

1. **贝叶斯更新**：将后验作为先验。
$$
P(c_t|x_t) \rightarrow P(c_{t+1})
$$`,
      requestedTitle: "Bayes",
    });
    const buffer = await teachingDocumentToDocx(projection.revision);
    const documentXml = await zipEntryText(buffer, "word/document.xml");

    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toContain("<m:sSub>");
    expect(documentXml).not.toContain("$$");
    expect(documentXml).not.toContain("\\rightarrow");
  });

  test("exports thematic breaks from canonical projected content", async () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "# Sections\n\nBefore\n\n---\n\nAfter",
      requestedTitle: "Fallback",
    });
    await expect(teachingDocumentToDocx(projection.revision)).resolves.toBeInstanceOf(Buffer);
  });

  test("exports canonical tables with Word table borders", async () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput: "阶段 | 时间跨度\n--- | ---\n批处理时代 | 1950s–1960s",
      requestedTitle: "HCI history",
    });
    const buffer = await teachingDocumentToDocx(projection.revision);
    const documentXml = await zipEntryText(buffer, "word/document.xml");

    expect(documentXml).toContain("<w:tblBorders>");
    for (const side of ["top", "bottom", "left", "right", "insideH", "insideV"]) {
      expect(documentXml).toContain(`<w:${side} w:val="single" w:color="CBD5E1" w:sz="4"/>`);
    }
  });

  test("preserves rich semantics with the official exporter defaults", async () => {
    const projection = projectTeachingDocument({
      outcome: "complete",
      rawOutput:
        "# 第一章\n\n从**信息论**理解区块链。\n\n- 技术维度\n  - 存储层\n  - 网络层\n\n| **维度** | **说明** |\n| --- | --- |\n| 信任 | 数学与密码学 |",
      requestedTitle: "区块链技术基础教学文档",
    });
    const buffer = await teachingDocumentToDocx(projection.revision);
    const [documentXml, numberingXml] = await Promise.all([
      zipEntryText(buffer, "word/document.xml"),
      zipEntryText(buffer, "word/numbering.xml"),
    ]);

    expect(documentXml).not.toContain("**信息论**");
    expect(documentXml).not.toContain("**维度**");
    expect(documentXml).toMatch(/<w:b(?:\s[^>]*)?\/>/);
    expect(documentXml).toContain("<w:numPr>");
    expect(numberingXml).toContain('w:numFmt w:val="bullet"');
    expect(documentXml).toContain('w:tblW w:type="pct" w:w="100%"');
    expect(documentXml).toContain('w:tblLayout w:type="autofit"');
  });
});
