import { describe, expect, test } from "vitest";
import {
  teachingDocumentBlocksWithoutRepeatedTitle,
  teachingDocumentDraftSchema,
  teachingDocumentRevisionContentSchema,
} from "./contract";
import { finalizeTeachingDocumentDraft } from "./finalize";

describe("teaching document contract", () => {
  test("finalizes a validated draft into controlled Tiptap JSON with stable node ids", () => {
    const draft = teachingDocumentDraftSchema.parse({
      blocks: [
        { kind: "heading", level: 2, text: "核心概念" },
        { kind: "paragraph", text: "TCP/IP 是互联网通信协议簇。" },
        { kind: "bullet", text: "IP 负责寻址与路由。" },
        { kind: "bullet", text: "TCP 负责可靠传输。" },
      ],
      title: "TCP/IP 入门",
    });

    const content = finalizeTeachingDocumentDraft(draft);
    expect(teachingDocumentRevisionContentSchema.parse(content)).toEqual(content);
    expect(content.document.content).toHaveLength(3);
    expect(content.document.content.every((node) => Boolean(node.attrs.id))).toBe(true);
  });

  test("supports ordered steps, quotations, and code blocks without arbitrary document nodes", () => {
    const content = finalizeTeachingDocumentDraft(
      teachingDocumentDraftSchema.parse({
        blocks: [
          { kind: "heading", level: 1, text: "实践" },
          { kind: "ordered", text: "安装依赖" },
          { kind: "quote", text: "先验证，再提交。" },
          { kind: "code", language: "ts", text: "const ready = true;" },
        ],
        title: "高级格式",
      }),
    );

    expect(content.document.content.map((node) => node.type)).toEqual([
      "heading",
      "orderedList",
      "blockquote",
      "codeBlock",
    ]);
    expect(teachingDocumentRevisionContentSchema.parse(content)).toEqual(content);
  });

  test("removes a repeated leading title from stream and persisted content", () => {
    const draft = teachingDocumentDraftSchema.parse({
      blocks: [
        { kind: "heading", level: 1, text: " TCP/IP  入门 " },
        { kind: "paragraph", text: "概览" },
        { kind: "heading", level: 2, text: "核心概念" },
        { kind: "paragraph", text: "正文" },
      ],
      title: "TCP/IP 入门",
    });

    expect(teachingDocumentBlocksWithoutRepeatedTitle(draft)).toEqual(draft.blocks.slice(1));
    const content = finalizeTeachingDocumentDraft(draft);
    expect(content.document.content[0]?.type).toBe("paragraph");
  });

  test("rejects arbitrary Tiptap nodes at the persistence boundary", () => {
    expect(
      teachingDocumentRevisionContentSchema.safeParse({
        document: { content: [{ attrs: { id: "x" }, type: "image" }], type: "doc" },
        generation: { outcome: "complete", rawOutput: "Unsafe", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "Unsafe",
        title: "Unsafe",
      }).success,
    ).toBe(false);
  });

  test("accepts long single-line generated code without treating style as validity", () => {
    const generated = {
      blocks: [
        { kind: "heading", level: 1, text: "Python" },
        { kind: "paragraph", text: "准备环境" },
        { kind: "paragraph", text: "连接节点" },
        { kind: "code", language: "py", text: `from web3 import ${"Symbol,".repeat(40)}` },
      ],
      title: "Python 与智能合约",
    };
    expect(teachingDocumentDraftSchema.safeParse(generated).success).toBe(true);

    expect(
      teachingDocumentRevisionContentSchema.safeParse({
        document: {
          content: [
            {
              attrs: { id: "manual-code", language: "py" },
              content: [{ text: generated.blocks[3]?.text, type: "text" }],
              type: "codeBlock",
            },
          ],
          type: "doc",
        },
        generation: { outcome: "complete", rawOutput: generated.title, warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: generated.title,
        title: generated.title,
      }).success,
    ).toBe(true);
  });
});
