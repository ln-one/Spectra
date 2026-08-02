import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import type { KnowledgeCitationEvidence } from "@/features/agents/knowledge-citation-contract";
import { trustedKnowledgeCitationRemarkPlugin } from "./trusted-knowledge-citation-markdown";

const visualEvidence: KnowledgeCitationEvidence = {
  citationNumber: 1,
  citationToken: "ke-0123456789abcdef",
  content: {
    accessibleDescription: "凸轮轴拆卸结构图",
    kind: "visual_region",
  },
  contentHash: "a".repeat(64),
  evidenceId: "00000000-0000-4000-8000-000000000091",
  exactExcerpt: "凸轮轴拆卸结构图",
  fidelity: "source",
  locator: {
    boxes: [{ bottom: 1, left: 0, right: 1, top: 0 }],
    kind: "page_region",
    pageIndex: 10,
  },
  representationHash: "b".repeat(64),
  sourceId: "00000000-0000-4000-8000-000000000092",
  sourceName: "摩托车发动机维修手册.pdf",
  sourceRevision: 1,
};

function project(markdown: string, visualTokens: readonly string[]) {
  const processor = unified()
    .use(remarkParse)
    .use(trustedKnowledgeCitationRemarkPlugin([visualEvidence], visualTokens));
  return processor.runSync(processor.parse(markdown)) as Root;
}

describe("trustedKnowledgeCitationRemarkPlugin", () => {
  it("places a visual marker after the first block that cites the image", () => {
    const tree = project("拆卸前准备。\n\n按图示拆卸座盖 [E1]。\n\n图片后的检查说明。", [
      visualEvidence.citationToken,
    ]);

    expect(tree.children.map((child) => child.type)).toEqual([
      "paragraph",
      "paragraph",
      "thematicBreak",
      "paragraph",
    ]);
    expect(tree.children[2]?.data).toEqual({
      hName: "div",
      hProperties: {
        "data-knowledge-visual-token": visualEvidence.citationToken,
      },
    });
  });

  it("places each visual only once even when its citation repeats", () => {
    const tree = project(
      "第一次引用 [E1]。\n\n重复引用 [1](#knowledge-evidence-ke-0123456789abcdef)。",
      [visualEvidence.citationToken],
    );

    expect(tree.children.filter((child) => child.type === "thematicBreak")).toHaveLength(1);
  });

  it("folds a standalone visual citation into the figure marker", () => {
    const tree = project(
      "火花塞位置如下图所示：\n\n[1](#knowledge-evidence-ke-0123456789abcdef)\n\n继续检查。",
      [visualEvidence.citationToken],
    );

    expect(tree.children.map((child) => child.type)).toEqual([
      "paragraph",
      "thematicBreak",
      "paragraph",
    ]);
  });

  it("does not create a marker unless the renderer authorizes that visual", () => {
    const tree = project("仅作为普通引用 [E1]。", []);

    expect(tree.children.filter((child) => child.type === "thematicBreak")).toHaveLength(0);
  });
});
