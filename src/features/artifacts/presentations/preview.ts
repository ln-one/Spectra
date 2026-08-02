import { pptdPagePaths } from "@deckelier/contracts";
import type { PresentationDetail } from "./types";

export type PresentationPreviewPhase = "waiting" | "generating" | "checking" | "failed" | "ready";

function normalizePagePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.?\//, "");
}

export function presentationPreviewPhase(
  detail: PresentationDetail | null,
): PresentationPreviewPhase {
  if (detail?.generationState === "ready" && detail.artifact?.currentRevision) {
    return "ready";
  }
  if (detail?.generationState === "failed") return "failed";
  const preview = detail?.generationDraft?.preview;
  if (!preview) return "waiting";

  let manifestPages: string[];
  try {
    manifestPages = pptdPagePaths(preview.pptdContent);
  } catch {
    return "waiting";
  }
  if (manifestPages.length === 0) return "waiting";
  const completedPaths = new Set(Object.keys(preview.pageMap).map(normalizePagePath));
  const complete = manifestPages.every((path) => completedPaths.has(normalizePagePath(path)));
  if (complete || detail?.generationState === "finalizing") return "checking";
  return "generating";
}
