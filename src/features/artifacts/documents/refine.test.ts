import { describe, expect, it } from "vitest";
import { projectTeachingDocument } from "./projector";
import {
  applyTeachingDocumentRefineEdits,
  reviewTeachingDocumentProposalScope,
  teachingDocumentFocusSchema,
  teachingDocumentMarkdownPageWithBlockIds,
  validateTeachingDocumentFocus,
} from "./refine";

function document() {
  return projectTeachingDocument({
    outcome: "complete",
    rawOutput: "# 网络基础\n\n第一段介绍 TCP。\n\n## 路由\n\n第二段介绍 IP。",
    requestedTitle: "网络基础",
  }).revision;
}

describe("teaching document refine", () => {
  it("replaces a stable block while preserving untouched identities", () => {
    const base = document();
    const target = base.document.content[1];
    const untouched = base.document.content[2];
    if (!target || !untouched) throw new Error("Expected projected document blocks");

    const result = applyTeachingDocumentRefineEdits(base, [
      {
        blockId: target.attrs.id,
        operation: "replace_block",
        replacementMarkdown: "精简后的 TCP 介绍。",
      },
    ]);

    expect(result.content.sourceMarkdown).toContain("精简后的 TCP 介绍");
    expect(
      result.content.document.content.some((block) => block.attrs.id === target.attrs.id),
    ).toBe(false);
    expect(
      result.content.document.content.some((block) => block.attrs.id === untouched.attrs.id),
    ).toBe(true);
    expect(result.changes).toHaveLength(1);
  });

  it("rejects duplicate targets, unknown blocks, and deleting all content", () => {
    const base = document();
    const target = base.document.content[0];
    if (!target) throw new Error("Expected a projected document block");
    expect(() =>
      applyTeachingDocumentRefineEdits(base, [
        { blockId: target.attrs.id, operation: "delete_block" },
        { blockId: target.attrs.id, markdown: "重复", operation: "insert_after" },
      ]),
    ).toThrow();
    expect(() =>
      applyTeachingDocumentRefineEdits(base, [{ blockId: "missing", operation: "delete_block" }]),
    ).toThrow("teaching_document_refine_block_not_found");
    expect(() =>
      applyTeachingDocumentRefineEdits(
        projectTeachingDocument({
          outcome: "complete",
          rawOutput: "Only one block",
          requestedTitle: "One",
        }).revision,
        [{ blockId: "node-0-paragraph", operation: "delete_block" }],
      ),
    ).toThrow("teaching_document_refine_empty_document");
  });

  it("keeps generated node identities unique across accepted revisions", () => {
    const base = document();
    const firstTarget = base.document.content[0];
    const secondTarget = base.document.content[2];
    if (!firstTarget || !secondTarget) throw new Error("Expected document targets");
    const first = applyTeachingDocumentRefineEdits(base, [
      { blockId: firstTarget.attrs.id, markdown: "第一次插入。", operation: "insert_after" },
    ]).content;
    const second = applyTeachingDocumentRefineEdits(first, [
      { blockId: secondTarget.attrs.id, markdown: "第二次插入。", operation: "insert_after" },
    ]).content;
    const ids = second.document.content.map((block) => block.attrs.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validates focus against current revision text and emits model-visible block handles", () => {
    const base = document();
    const target = base.document.content[1];
    if (!target) throw new Error("Expected a projected document block");
    const focus = teachingDocumentFocusSchema.parse({
      blockIds: [target.attrs.id],
      kind: "teaching_document_blocks",
      revisionId: "33d3e52c-0a57-498e-aa6d-b2478e51f5a6",
      selectedText: "TCP",
    });

    expect(validateTeachingDocumentFocus(base, focus)).toEqual(focus);
    expect(validateTeachingDocumentFocus(base, { ...focus, selectedText: "旧内容" })).toBeNull();
    expect(teachingDocumentMarkdownPageWithBlockIds(base)?.markdown).toContain(
      `[block:${target.attrs.id}]`,
    );
  });

  it("limits focused proposals to the selected top-level blocks", () => {
    const base = document();
    const first = base.document.content[1];
    const second = base.document.content[3];
    if (!first || !second) throw new Error("Expected projected document blocks");
    const focus = teachingDocumentFocusSchema.parse({
      blockIds: [first.attrs.id, second.attrs.id],
      kind: "teaching_document_blocks",
      revisionId: "33d3e52c-0a57-498e-aa6d-b2478e51f5a6",
      selectedText: "TCP IP",
    });

    expect(
      reviewTeachingDocumentProposalScope(focus, [
        {
          blockId: first.attrs.id,
          operation: "replace_block",
          replacementMarkdown: "TCP",
        },
        { blockId: second.attrs.id, markdown: "IP", operation: "insert_after" },
      ]),
    ).toEqual({ status: "allowed" });
    expect(
      reviewTeachingDocumentProposalScope(focus, [
        { blockId: "outside-selection", operation: "delete_block" },
      ]),
    ).toEqual({ allowedBlockIds: [first.attrs.id, second.attrs.id], status: "outside_scope" });
    expect(
      reviewTeachingDocumentProposalScope(focus, [
        { operation: "update_title", title: "越界标题" },
      ]),
    ).toEqual({ allowedBlockIds: [first.attrs.id, second.attrs.id], status: "outside_scope" });
    expect(
      reviewTeachingDocumentProposalScope(undefined, [
        { operation: "update_title", title: "允许全文修改" },
      ]),
    ).toEqual({ status: "allowed" });
  });

  it("keeps the four trust mechanisms list as the complete proposal boundary", () => {
    const base = projectTeachingDocument({
      outcome: "complete",
      rawOutput:
        "# 区块链\n\n## 区块链如何实现信任？\n\n1. 数学信任\n2. 经济激励\n3. 博弈论机制\n4. 代码透明\n\n## 其他内容\n\n不应被修改。",
      requestedTitle: "区块链",
    }).revision;
    const selectedList = base.document.content.find(
      (block) => block.type === "orderedList" || block.type === "bulletList",
    );
    const outside = base.document.content.find(
      (block) => block.attrs.id !== selectedList?.attrs.id && block.type === "paragraph",
    );
    if (!selectedList || !outside) throw new Error("Expected list and outside paragraph blocks");
    const focus = teachingDocumentFocusSchema.parse({
      blockIds: [selectedList.attrs.id],
      kind: "teaching_document_blocks",
      revisionId: "33d3e52c-0a57-498e-aa6d-b2478e51f5a6",
      selectedText: "数学信任 经济激励 博弈论机制 代码透明",
    });

    expect(validateTeachingDocumentFocus(base, focus)).toEqual(focus);
    expect(
      reviewTeachingDocumentProposalScope(focus, [
        {
          blockId: selectedList.attrs.id,
          operation: "replace_block",
          replacementMarkdown: "1. 数学信任\n2. 经济激励\n3. 博弈论机制\n4. 代码透明",
        },
      ]),
    ).toEqual({ status: "allowed" });
    expect(
      reviewTeachingDocumentProposalScope(focus, [
        {
          blockId: outside.attrs.id,
          operation: "replace_block",
          replacementMarkdown: "越界修改整个章节",
        },
      ]),
    ).toEqual({ allowedBlockIds: [selectedList.attrs.id], status: "outside_scope" });
  });
});
