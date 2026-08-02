import { describe, expect, it } from "vitest";
import { knowledgeEvidenceContextSchema } from "./evidence-context";
import { buildKnowledgeEvidenceContext } from "./evidence-context.server";

const evidenceId = "00000000-0000-4000-8000-000000000071";

describe("Knowledge evidence context selection", () => {
  it("selects one neighboring text block on each side and highlights the hit", () => {
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt: "拆下气缸头盖。",
      hitBlockOrdinal: 4,
      blocks: [
        { ordinal: 3, headingPath: ["维修"], exactText: "拆卸前先清理气缸头周围区域。" },
        {
          ordinal: 4,
          headingPath: ["维修"],
          exactText: "维修前需要先拆下气缸头盖。随后按顺序松开螺栓。",
        },
        { ordinal: 5, headingPath: ["维修"], exactText: "拆卸完成后妥善放置所有部件。" },
      ],
    });

    expect(result.contextText).toBe(
      "拆卸前先清理气缸头周围区域。\n\n维修前需要先拆下气缸头盖。随后按顺序松开螺栓。\n\n拆卸完成后妥善放置所有部件。",
    );
    expect(result.highlight).not.toBeNull();
    expect(result.contextText.slice(result.highlight?.start, result.highlight?.end)).toBe(
      "拆下气缸头盖。",
    );
  });

  it("does not cross a heading boundary", () => {
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt: "当前命中",
      hitBlockOrdinal: 2,
      blocks: [
        { ordinal: 1, headingPath: ["其他章节"], exactText: "不相关前文" },
        { ordinal: 2, headingPath: ["当前章节"], exactText: "当前命中段落" },
        { ordinal: 3, headingPath: ["其他章节"], exactText: "不相关后文" },
      ],
    });

    expect(result.contextText).toBe("当前命中段落");
  });

  it("caps context while preserving the highlighted excerpt", () => {
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt: "命中摘录",
      hitBlockOrdinal: 2,
      blocks: [
        { ordinal: 1, headingPath: ["章节"], exactText: "前".repeat(900) },
        {
          ordinal: 2,
          headingPath: ["章节"],
          exactText: `${"中".repeat(700)}命中摘录${"后".repeat(700)}`,
        },
        { ordinal: 3, headingPath: ["章节"], exactText: "尾".repeat(900) },
      ],
    });

    expect(result.contextText.length).toBeLessThanOrEqual(1_200);
    expect(result.highlight).not.toBeNull();
    expect(result.contextText.slice(result.highlight?.start, result.highlight?.end)).toBe(
      "命中摘录",
    );
  });

  it("returns detached highlighting when the excerpt is not present in the indexed block", () => {
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt: "归一化后的摘录",
      hitBlockOrdinal: 1,
      blocks: [{ ordinal: 1, headingPath: [], exactText: "索引中保存的原始段落" }],
    });

    expect(result.contextText).toBe("索引中保存的原始段落");
    expect(result.highlight).toBeNull();
    expect(result.exactExcerpt).toBe("归一化后的摘录");
  });

  it("does not guess when the same excerpt appears more than once", () => {
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt: "重复摘录",
      hitBlockOrdinal: 1,
      blocks: [{ ordinal: 1, headingPath: [], exactText: "重复摘录；中间内容；重复摘录" }],
    });

    expect(result.highlight).toBeNull();
  });

  it("never replaces excerpt characters with truncation markers at the size limit", () => {
    const exactExcerpt = "命".repeat(1_199);
    const result = buildKnowledgeEvidenceContext({
      evidenceId,
      exactExcerpt,
      hitBlockOrdinal: 1,
      blocks: [{ ordinal: 1, headingPath: [], exactText: `前${exactExcerpt}后` }],
    });

    expect(result.contextText.length).toBeLessThanOrEqual(1_200);
    expect(result.highlight).not.toBeNull();
    expect(result.contextText.slice(result.highlight?.start, result.highlight?.end)).toBe(
      exactExcerpt,
    );
  });

  it("rejects highlight offsets outside the returned context", () => {
    expect(
      knowledgeEvidenceContextSchema.safeParse({
        evidenceId,
        contextText: "短文本",
        exactExcerpt: "文本",
        highlight: { start: 1, end: 10 },
      }).success,
    ).toBe(false);
  });
});
