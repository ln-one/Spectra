import { describe, expect, it } from "vitest";
import { projectMarkdownRepresentation, projectRepresentation } from "./projection";

describe("knowledge projection", () => {
  it("uses headings as hard boundaries and preserves exact locators", () => {
    const text =
      "# A\n\n第一句。第二句。\n\n- one\n- two\n\n## B\n\n| x | y |\n| - | - |\n| 1 | 2 |";
    const result = projectMarkdownRepresentation({ representationId: "r1", text });

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.map((chunk) => chunk.headingPath)).toEqual([["A"], ["A", "B"]]);
    for (const block of result.blocks) {
      expect(block.locator.kind).toBe("text_range");
      if (block.locator.kind !== "text_range") throw new Error("Expected text locator");
      expect(text.slice(block.locator.start, block.locator.end)).toBe(block.exactText);
    }
    for (const evidence of result.evidenceUnits) {
      expect(evidence.locator.kind).toBe("text_range");
      if (evidence.locator.kind !== "text_range") throw new Error("Expected text locator");
      expect(text.slice(evidence.locator.start, evidence.locator.end)).toBe(evidence.exactExcerpt);
    }
  });

  it("splits only an oversized block and keeps stable identities", () => {
    const text = `# 标题\n\n${"甲".repeat(530)}`;
    const first = projectMarkdownRepresentation({ representationId: "r1", text });
    const second = projectMarkdownRepresentation({ representationId: "r1", text });

    expect(first.blocks.filter((block) => block.kind === "paragraph")).toHaveLength(2);
    expect(first.chunks).toHaveLength(2);
    expect(first).toEqual(second);
  });

  it("does not collapse Chunk and EvidenceUnit identity", () => {
    const text = "# A\n\nSentence one. Sentence two.";
    const result = projectMarkdownRepresentation({ representationId: "r1", text });
    expect(result.chunks).toHaveLength(1);
    expect(result.evidenceUnits.length).toBeGreaterThan(1);
    expect(result.evidenceUnits.every((unit) => unit.id !== result.chunks[0]?.id)).toBe(true);
  });

  it("preserves pure visual evidence without creating a searchable chunk", () => {
    const visual = projectRepresentation({
      representationId: "visual-r1",
      blocks: [
        {
          kind: "visual",
          exactText: null,
          indexText: null,
          locator: {
            kind: "page_regions",
            regions: [{ pageIndex: 0, boxes: [] }],
          },
          content: {
            kind: "visual_region",
            asset: { kind: "ingestion_archive_entry", path: "images/region.png" },
          },
          fidelity: "model-description",
        },
      ],
    });

    expect(visual.blocks).toHaveLength(1);
    expect(visual.chunks).toHaveLength(0);
    expect(visual.evidenceUnits).toMatchObject([
      { exactExcerpt: null, capacityUnits: 0, content: { kind: "visual_region" } },
    ]);
  });

  it("includes locator and fidelity in V2 content hashes", () => {
    const create = (fidelity: "source" | "ocr") =>
      projectRepresentation({
        representationId: "hash-r1",
        blocks: [
          {
            kind: "paragraph",
            exactText: "same text",
            locator: { kind: "page_regions", regions: [{ pageIndex: 0, boxes: [] }] },
            fidelity,
          },
        ],
      });

    expect(create("source").blocks[0]?.contentHash).not.toBe(create("ocr").blocks[0]?.contentHash);
    expect(create("source").evidenceUnits[0]?.contentHash).not.toBe(
      create("ocr").evidenceUnits[0]?.contentHash,
    );
  });
});
