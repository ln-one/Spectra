import { describe, expect, it } from "vitest";
import type { KnowledgeCitationEvidence } from "@/features/agents/knowledge-citation-contract";
import {
  knowledgeCitationDisplayNumbers,
  knowledgeCitationTokensInMarkdown,
  knowledgeVisualEvidencePlacement,
} from "./knowledge-evidence-projection";

function evidence(
  citationNumber: number,
  citationToken: string,
  evidenceId: string,
): KnowledgeCitationEvidence {
  return {
    citationNumber,
    citationToken,
    evidenceId,
    sourceId: "00000000-0000-4000-8000-000000000032",
    sourceName: "绪论.pdf",
    sourceRevision: 1,
    exactExcerpt: `Evidence ${citationNumber}`,
    locator: { kind: "text_range", start: citationNumber, end: citationNumber + 1 },
    content: { kind: "exact_text", text: `Evidence ${citationNumber}` },
    contentHash: "a".repeat(64),
    fidelity: "source",
    representationHash: "b".repeat(64),
  };
}

describe("knowledgeCitationDisplayNumbers", () => {
  it("returns normalized trusted citation tokens for placement decisions", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");

    expect(
      knowledgeCitationTokensInMarkdown(
        `图片说明 [E4]，再次引用 [4](#knowledge-evidence-${fourth.citationToken})。`,
        [fourth],
      ),
    ).toEqual([fourth.citationToken, fourth.citationToken]);
  });

  it("anchors each visual at its first visible trusted link and leaves uncited visuals unanchored", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const seventh = evidence(7, "ke-7777777777777777", "00000000-0000-4000-8000-000000000037");
    const parts = [
      {
        text: `隐藏的工具前引用 [4](#knowledge-evidence-${fourth.citationToken})。`,
        type: "text",
      },
      { toolName: "searchWorkspace", type: "tool-call" },
      {
        text: `可见回答中的图片引用 [4](#knowledge-evidence-${fourth.citationToken})，随后再次引用 [4](#knowledge-evidence-${fourth.citationToken})。`,
        type: "text",
      },
    ];

    const placement = knowledgeVisualEvidencePlacement(
      parts,
      [fourth, seventh],
      [fourth, seventh],
      new Set([2]),
    );

    expect([...placement.tokensByPartIndex]).toEqual([[2, [fourth.citationToken]]]);
    expect(placement.unanchoredVisualEvidence).toEqual([seventh]);
  });

  it("waits for a complete trusted link while a visual citation is streaming", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const partial = knowledgeVisualEvidencePlacement(
      [{ state: "streaming", text: "图片如下 [4]", type: "text" }],
      [fourth],
      [fourth],
      new Set([0]),
      true,
    );
    const complete = knowledgeVisualEvidencePlacement(
      [
        {
          state: "streaming",
          text: `图片如下 [4](#knowledge-evidence-${fourth.citationToken})`,
          type: "text",
        },
      ],
      [fourth],
      [fourth],
      new Set([0]),
      true,
    );

    expect([...partial.tokensByPartIndex]).toEqual([]);
    expect([...complete.tokensByPartIndex]).toEqual([[0, [fourth.citationToken]]]);
  });

  it("does not turn a bare citation number into a visual after streaming ends", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const placement = knowledgeVisualEvidencePlacement(
      [{ text: "这里只是普通编号 [4]，没有选择展示图片。", type: "text" }],
      [fourth],
      [fourth],
      new Set([0]),
    );

    expect([...placement.tokensByPartIndex]).toEqual([]);
    expect(placement.unanchoredVisualEvidence).toEqual([fourth]);
  });

  it("numbers only trusted citations by first appearance instead of packed Evidence order", () => {
    const third = evidence(3, "ke-3333333333333333", "00000000-0000-4000-8000-000000000033");
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const parts = [
      {
        type: "text",
        text: [
          "虚构引用。[9](#knowledge-evidence-ke-9999999999999999)",
          `第一条可信结论。[3](#knowledge-evidence-${third.citationToken})`,
          `重复引用。[3](#knowledge-evidence-${third.citationToken})`,
          `第二条可信结论。[4](#knowledge-evidence-${fourth.citationToken})`,
        ].join(" "),
      },
    ];

    expect([...knowledgeCitationDisplayNumbers(parts, [third, fourth])]).toEqual([
      [third.citationToken, 1],
      [fourth.citationToken, 2],
    ]);
  });

  it("normalizes only trusted model footnote fallbacks before numbering by appearance", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const seventh = evidence(7, "ke-7777777777777777", "00000000-0000-4000-8000-000000000037");
    const parts = [
      {
        type: "text",
        text: [
          "第七条先出现 [E7]，小写也可恢复 [e7]。",
          "未知脚注保持未验证 [^9]。",
          `第四条随后出现 [4](#knowledge-evidence-${fourth.citationToken})。`,
          "模型标签、脚注和纯数字也可恢复 [C7][^7][7]。",
        ].join(" "),
      },
    ];

    expect([...knowledgeCitationDisplayNumbers(parts, [fourth, seventh])]).toEqual([
      [seventh.citationToken, 1],
      [fourth.citationToken, 2],
    ]);
  });

  it("ignores citation-shaped text inside inline and fenced code", () => {
    const fourth = evidence(4, "ke-4444444444444444", "00000000-0000-4000-8000-000000000034");
    const seventh = evidence(7, "ke-7777777777777777", "00000000-0000-4000-8000-000000000037");
    const parts = [
      {
        type: "text",
        text: [
          '示例代码中的 `const ref = "[E7]"` 不是引用。',
          "```text",
          "[E7]",
          "```",
          "正文中的 [E4] 才是第一条引用。",
          "正文中的 [E7] 随后出现。",
        ].join("\n"),
      },
    ];

    expect([...knowledgeCitationDisplayNumbers(parts, [fourth, seventh])]).toEqual([
      [fourth.citationToken, 1],
      [seventh.citationToken, 2],
    ]);
  });
});
