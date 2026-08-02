import "server-only";

import path from "node:path";
import { pptdPageLocalAssetPaths } from "@deckelier/contracts";
import { parseDocument } from "yaml";
import { z } from "zod";
import type { PresentationProgress } from "@/features/artifacts/task-agent/progress";
import {
  PRESENTATION_DRAFT_MAX_FILE_BYTES,
  PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES,
} from "./editor-policy";
import type { PresentationDraftEvent } from "./realtime";

const PRESENTATION_DRAFT_ENTRYPOINT = "out/presentation/presentation.pptd";

const pptdProjectSchema = z
  .object({
    pages: z.array(z.string().trim().min(1).max(500)).min(1).max(200),
  })
  .passthrough()
  .superRefine((project, context) => {
    if (new Set(project.pages).size !== project.pages.length) {
      context.addIssue({
        code: "custom",
        message: "Presentation page paths must be unique",
      });
    }
  });

function decodeDraftFile(body: Uint8Array) {
  if (body.byteLength < 1 || body.byteLength > PRESENTATION_DRAFT_MAX_FILE_BYTES) {
    throw new Error("presentation_draft_file_size");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch (error) {
    throw new Error("presentation_draft_file_encoding", { cause: error });
  }
}

function parseDraftProject(content: string) {
  try {
    const document = parseDocument(content, { schema: "core", strict: true });
    if (document.errors.length > 0) throw document.errors[0];
    return pptdProjectSchema.parse(document.toJS());
  } catch (error) {
    throw new Error("presentation_draft_pptd_invalid", { cause: error });
  }
}

function resolveProjectPath(reference: string) {
  if (
    reference.startsWith("/") ||
    reference.includes("\\") ||
    reference.split("/").includes("..")
  ) {
    return null;
  }
  const projectDirectory = path.posix.dirname(PRESENTATION_DRAFT_ENTRYPOINT);
  const resolved = path.posix.normalize(path.posix.join(projectDirectory, reference));
  return resolved.startsWith(`${projectDirectory}/`) ? resolved : null;
}

function isGeneratedPresentationPageProgress(progress: PresentationProgress) {
  return (
    progress.phase === "pptd" &&
    progress.status === "progress" &&
    progress.operation === "generated" &&
    progress.pagePath !== undefined
  );
}

// The progress hook reports page paths relative to the project directory, while
// the manifest lists the same pages using its own spelling. Normalizing both
// sides lets a page event match its manifest entry even when the spellings
// differ trivially (for example a leading "./").
function comparablePagePath(reference: string) {
  if (reference.startsWith("/") || reference.includes("\\")) return null;
  return path.posix.normalize(reference);
}

export async function materializePresentationDraftEvent(input: {
  deliveredPagePaths: readonly string[];
  downloadFile(path: string, maxBytes?: number): Promise<Uint8Array>;
  isInitialEvent: boolean;
  progress: PresentationProgress;
  workspacePath: string;
}): Promise<readonly Omit<PresentationDraftEvent, "sequence">[]> {
  if (!isGeneratedPresentationPageProgress(input.progress)) return [];
  const reportedPagePath = input.progress.pagePath;
  if (reportedPagePath === undefined) return [];
  const entrypointPath = `${input.workspacePath}/${PRESENTATION_DRAFT_ENTRYPOINT}`;
  const pptdContent = decodeDraftFile(
    await input.downloadFile(entrypointPath, PRESENTATION_DRAFT_MAX_FILE_BYTES),
  );
  const project = parseDraftProject(pptdContent);
  // The page number and total are derived from the manifest, which is written
  // before any page file, so they stay stable for the whole authoring run.
  const reportedPath = comparablePagePath(reportedPagePath);
  const delivered = new Set(input.deliveredPagePaths);
  // Deliver the reported page (its content just changed) plus any manifest
  // page that has not been delivered yet. The latter recovers a page whose
  // earlier materialization failed, or that was edited by a tool the progress
  // hook does not observe (for example a terminal `sed` fixing every page), so
  // a page is never stranded by a single failed or missing report.
  const targets = project.pages
    .map((pagePath, pageIndex) => ({ pagePath, pageIndex }))
    .filter(({ pagePath }) => {
      const isReported = reportedPath !== null && comparablePagePath(pagePath) === reportedPath;
      return isReported || !delivered.has(pagePath);
    });
  const events: Omit<PresentationDraftEvent, "sequence">[] = [];
  for (const target of targets) {
    try {
      events.push(
        await materializeDraftPage({
          downloadFile: input.downloadFile,
          pageIndex: target.pageIndex,
          pagePath: target.pagePath,
          pptdContent,
          totalPages: project.pages.length,
          workspacePath: input.workspacePath,
        }),
      );
    } catch {
      // The page is not previewable yet (schema violation, missing file, or a
      // pending image asset). Leave it undelivered so the next progress event
      // retries it instead of dropping it for the rest of the run.
    }
  }
  if (events.length > 0 && input.isInitialEvent) {
    const [first, ...rest] = events;
    if (first) return [{ ...first, pptdContent }, ...rest];
  }
  return events;
}

async function materializeDraftPage(input: {
  downloadFile(path: string, maxBytes?: number): Promise<Uint8Array>;
  pageIndex: number;
  pagePath: string;
  pptdContent: string;
  totalPages: number;
  workspacePath: string;
}): Promise<Omit<PresentationDraftEvent, "sequence">> {
  const resolvedPagePath = resolveProjectPath(input.pagePath);
  if (!resolvedPagePath) throw new Error("presentation_draft_page_path_unsafe");
  const pageContent = decodeDraftFile(
    await input.downloadFile(
      `${input.workspacePath}/${resolvedPagePath}`,
      PRESENTATION_DRAFT_MAX_FILE_BYTES,
    ),
  );
  const referencedAssets = new Set(pptdPageLocalAssetPaths(pageContent));
  if (referencedAssets.size > PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS) {
    throw new Error("presentation_draft_assets_too_many");
  }
  let assetBytes = 0;
  for (const assetPath of referencedAssets) {
    const resolvedAssetPath = resolveProjectPath(assetPath.replace(/^\/+/, ""));
    if (!resolvedAssetPath) throw new Error("presentation_draft_asset_path_unsafe");
    const asset = await input.downloadFile(
      `${input.workspacePath}/${resolvedAssetPath}`,
      PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
    );
    assetBytes += asset.byteLength;
    if (assetBytes > PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES) {
      throw new Error("presentation_draft_assets_too_large");
    }
  }
  return {
    event: "page_updated",
    kind: "presentation",
    pageContent,
    pageNumber: input.pageIndex + 1,
    pagePath: input.pagePath,
    totalPages: input.totalPages,
    version: 1,
  };
}
