import { describe, expect, test } from "vitest";
import { artifactPresentation } from "@/features/artifacts/ui/artifact-presentation";
import { sourcePresentationHintForFilename, sourceVisualFamily } from "./presentation";
import {
  artifactSourcePresentation,
  sourcePresentationFromHint,
  workspaceSourcePresentation,
} from "./ui/source-file-presentation";

describe("source presentation", () => {
  test.each([
    ["paper.pdf", "pdf"],
    ["lesson.docx", "document"],
    ["deck.pptx", "presentation"],
    ["scores.xlsx", "spreadsheet"],
    ["scores.csv", "table"],
    ["notes.md", "text"],
    ["data.json", "structured"],
    ["main.ts", "code"],
    ["captions.vtt", "captions"],
    ["analysis.ipynb", "notebook"],
    ["photo.png", "image"],
    ["speech.mp3", "audio"],
    ["demo.mp4", "video"],
    ["artifact-without-extension", "neutral"],
  ] as const)("maps %s to the %s visual family", (filename, family) => {
    expect(sourceVisualFamily(filename)).toBe(family);
    expect(sourcePresentationHintForFilename(filename)).toEqual({
      family,
      kind: "file",
    });
  });

  test.each([
    ["teaching_document", "blue"],
    ["mind_map", "teal"],
    ["quiz", "violet"],
    ["game", "rose"],
    ["presentation", "orange"],
    ["animation", "green"],
  ] as const)("keeps the %s artifact on its canonical %s tone", (kind, tone) => {
    expect(artifactPresentation(kind).tone).toBe(tone);
    if (kind === "presentation" || kind === "animation") return;
    expect(artifactSourcePresentation(kind).tone).toBe(tone);
  });

  test("distinguishes available and unavailable workspace references", () => {
    expect(workspaceSourcePresentation()).toMatchObject({
      category: "workspace",
      iconTone: "workspace",
    });
    expect(workspaceSourcePresentation(true)).toMatchObject({
      category: "workspace",
      iconTone: "neutral",
    });
  });

  test("uses hints when present and falls back to a filename for old evidence", () => {
    expect(
      sourcePresentationFromHint(
        { artifactKind: "quiz", kind: "artifact" },
        "artifact-without-extension",
      ),
    ).toMatchObject({ category: "artifact", tone: "violet" });
    expect(sourcePresentationFromHint(undefined, "legacy.pdf")).toMatchObject({
      category: "file",
      iconTone: "pdf",
    });
  });
});
