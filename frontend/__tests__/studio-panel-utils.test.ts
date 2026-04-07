import type { ToolDraftState } from "@/components/project/features/studio/tools";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import {
  isPptStep2Stage,
  isDraftStateEqual,
  mergeToolArtifacts,
  normalizeHistoryStep,
} from "@/components/project/features/studio/panel/utils";

function makeArtifact(
  id: string,
  createdAt: string,
  overrides: Partial<ArtifactHistoryItem> = {}
): ArtifactHistoryItem {
  return {
    artifactId: id,
    sessionId: "s1",
    toolType: "mindmap",
    artifactType: "mindmap",
    title: id,
    status: "completed",
    createdAt,
    basedOnVersionId: null,
    ...overrides,
  };
}

describe("studio panel utils", () => {
  it("normalizes invalid history step to config", () => {
    expect(normalizeHistoryStep("preview")).toBe("preview");
    expect(normalizeHistoryStep("unknown")).toBe("config");
    expect(normalizeHistoryStep(null)).toBe("config");
  });

  it("detects ppt step2 stages for fullscreen layout", () => {
    expect(isPptStep2Stage("config")).toBe(false);
    expect(isPptStep2Stage("generating_outline")).toBe(true);
    expect(isPptStep2Stage("outline")).toBe(true);
    expect(isPptStep2Stage("preview")).toBe(false);
  });

  it("checks draft state equality", () => {
    const left: ToolDraftState = { prompt: "hello", pages: 10, tags: ["a"] };
    const same: ToolDraftState = { prompt: "hello", pages: 10, tags: ["a"] };
    const diff: ToolDraftState = { prompt: "hello", pages: 11, tags: ["a"] };

    expect(isDraftStateEqual(left, same)).toBe(true);
    expect(isDraftStateEqual(left, diff)).toBe(false);
    expect(isDraftStateEqual(undefined, same)).toBe(false);
  });

  it("merges runtime and stored artifacts with dedupe and sort", () => {
    const storeItems = [
      makeArtifact("a2", "2026-03-20T10:00:00.000Z"),
      makeArtifact("a1", "2026-03-20T09:00:00.000Z"),
    ];
    const runtime = {
      mindmap: [
        makeArtifact("a3", "2026-03-20T11:00:00.000Z"),
        makeArtifact("a1", "2026-03-20T12:00:00.000Z"),
      ],
    };

    const merged = mergeToolArtifacts("mindmap", storeItems, runtime);
    expect(merged.map((item) => item.artifactId)).toEqual(["a3", "a2", "a1"]);
  });
});
