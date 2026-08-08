import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  deterministicTaskAgentSourceArchive,
  readTaskAgentSourceArchive,
  type TaskAgentArchiveFile,
} from "../task-agent/source-archive";
import { presentationRevisionContentSchema, presentationSourceManifestSchema } from "./contract";
import {
  PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES,
} from "./editor-policy";

const pptdProjectSchema = z
  .object({
    pages: z.array(z.string().trim().min(1).max(500)).min(1).max(200),
    title: z.string().trim().min(1).max(200).optional(),
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

const pptdPageSchema = z
  .object({
    elements: z
      .array(
        z
          .object({
            content: z
              .object({
                style: z.string().optional(),
                // Agents sometimes write unquoted numbers (e.g. KPI values);
                // coerce them so the pipeline matches the editor schema.
                text: z.coerce.string().optional(),
              })
              .passthrough()
              .optional(),
            elementType: z.string().optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

function parseYaml<T>(body: Uint8Array, schema: z.ZodType<T>, failureCode: string) {
  try {
    const document = parseDocument(new TextDecoder().decode(body), {
      schema: "core",
      strict: true,
    });
    if (document.errors.length > 0) throw document.errors[0];
    return schema.parse(document.toJS());
  } catch (error) {
    throw new Error(failureCode, { cause: error });
  }
}

function fileStemTitle(filePath: string) {
  const stem = path.posix.basename(filePath, path.posix.extname(filePath));
  const title = stem
    .replace(/^\d+[-_. ]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (title || "Slide").slice(0, 300);
}

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function pageTitle(body: Uint8Array, filePath: string) {
  const page = parseYaml(body, pptdPageSchema, "presentation_page_invalid");
  const title = page.elements.find(
    (element) =>
      element.elementType === "text" &&
      ["$coverTitle", "$title"].includes(element.content?.style ?? "") &&
      element.content?.text,
  )?.content?.text;
  return title ? plainText(title) || fileStemTitle(filePath) : fileStemTitle(filePath);
}

function projectPagePath(entrypointPath: string, pagePath: string) {
  if (pagePath.startsWith("/") || pagePath.split(/[\\/]/).includes("..")) {
    throw new Error("presentation_page_path_unsafe");
  }
  const projectDirectory = path.posix.dirname(entrypointPath);
  const resolved = path.posix.normalize(path.posix.join(projectDirectory, pagePath));
  if (
    resolved === projectDirectory ||
    (projectDirectory !== "." && !resolved.startsWith(`${projectDirectory}/`))
  ) {
    throw new Error("presentation_page_path_unsafe");
  }
  return resolved;
}

function projectTitle(entrypoint: string, title?: string) {
  return (title?.trim() || fileStemTitle(entrypoint)).slice(0, 200);
}

function sourcePath(filePath: string) {
  return filePath.startsWith("out/") ? filePath : `out/${filePath}`;
}

function relativeEntrypoint(filePath: string) {
  return filePath.startsWith("out/") ? filePath.slice("out/".length) : filePath;
}

function presentationEntrypoint(files: readonly ExtractedFile[]) {
  const entrypoints = files.filter((file) => file.path.endsWith(".pptd"));
  if (entrypoints.length === 0) throw new Error("presentation_entrypoint_missing");
  if (entrypoints.length > 1) throw new Error("presentation_entrypoint_ambiguous");
  const entrypointFile = entrypoints[0];
  if (!entrypointFile) throw new Error("presentation_entrypoint_missing");
  return entrypointFile;
}

function presentationProject(files: readonly ExtractedFile[]) {
  const entrypointFile = presentationEntrypoint(files);
  const project = parseYaml(entrypointFile.body, pptdProjectSchema, "presentation_pptd_invalid");
  const pageTitles = project.pages.map((pageReference) => {
    const pagePath = projectPagePath(entrypointFile.path, pageReference);
    const pageFile = files.find((file) => file.path === pagePath);
    if (!pageFile) throw new Error("presentation_page_missing");
    return pageTitle(pageFile.body, pagePath);
  });
  return {
    entrypoint: relativeEntrypoint(entrypointFile.path),
    entrypointFile,
    project,
    pageTitles,
  };
}

type ExtractedFile = TaskAgentArchiveFile;

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

export function readPresentationSourceArchive(archive: Uint8Array) {
  return readTaskAgentSourceArchive(archive, { failurePrefix: "presentation" });
}

export function deterministicPresentationSourceArchive(files: readonly ExtractedFile[]) {
  return deterministicTaskAgentSourceArchive(files, {
    failurePrefix: "presentation",
  });
}

export async function inspectPresentationSourceArchive(archive: Uint8Array) {
  const files = await readPresentationSourceArchive(archive);
  const entrypoint = presentationEntrypoint(files);
  return { entrypoint: relativeEntrypoint(entrypoint.path), files };
}

// Splits an extracted source archive into the editor's input contract: the
// entrypoint .pptd YAML plus a page map keyed by the exact page references in
// the entrypoint's `pages` field (the editor resolves pages by those keys).
export function extractPresentationPptdSource(files: readonly ExtractedFile[]): {
  pageMap: Record<string, string>;
  pptdContent: string;
} {
  const entrypointFile = presentationEntrypoint(files);
  const project = parseYaml(entrypointFile.body, pptdProjectSchema, "presentation_pptd_invalid");
  const decoder = new TextDecoder();
  const pageMap: Record<string, string> = {};
  for (const pageReference of project.pages) {
    const pagePath = projectPagePath(entrypointFile.path, pageReference);
    const pageFile = files.find((file) => file.path === pagePath);
    if (!pageFile) throw new Error("presentation_page_missing");
    pageMap[pageReference] = decoder.decode(pageFile.body);
  }
  return { pageMap, pptdContent: decoder.decode(entrypointFile.body) };
}

const presentationImageFormats = new Map([
  [".gif", { format: "gif", mediaType: "image/gif" }],
  [".jpeg", { format: "jpeg", mediaType: "image/jpeg" }],
  [".jpg", { format: "jpeg", mediaType: "image/jpeg" }],
  [".png", { format: "png", mediaType: "image/png" }],
  [".svg", { format: "svg", mediaType: "image/svg+xml" }],
  [".webp", { format: "webp", mediaType: "image/webp" }],
]);
const MAX_PRESENTATION_EDITOR_IMAGE_PIXELS = 40_000_000;

export function resolvePresentationAssetPath(entrypointPath: string, requestedPath: string) {
  // The authoring sandbox writes absolute paths into PPTD files. Once the
  // project is archived, only the stable `out/...` suffix remains meaningful.
  const archivedPathIndex = requestedPath.lastIndexOf("/out/");
  const relativePath =
    archivedPathIndex >= 0
      ? requestedPath.slice(archivedPathIndex + 1)
      : requestedPath.replace(/^\/+/, "");
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..")
  ) {
    return null;
  }
  const projectDirectory = path.posix.dirname(entrypointPath);
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith(`${projectDirectory}/`)) return normalized;
  const resolved = path.posix.normalize(path.posix.join(projectDirectory, normalized));
  if (
    resolved === projectDirectory ||
    (projectDirectory !== "." && !resolved.startsWith(`${projectDirectory}/`))
  ) {
    return null;
  }
  return resolved;
}

export async function materializePresentationPptdAsset(
  assetPath: string,
  body: Uint8Array,
): Promise<{ dataUrl: string; sizeBytes: number } | undefined> {
  const expected = presentationImageFormats.get(path.posix.extname(assetPath).toLowerCase());
  if (!expected || body.byteLength < 1 || body.byteLength > PRESENTATION_EDITOR_MAX_IMAGE_BYTES) {
    return undefined;
  }
  try {
    const image = sharp(body, {
      animated: false,
      limitInputPixels: MAX_PRESENTATION_EDITOR_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    if (metadata.format !== expected.format) return undefined;
    await image.clone().resize(1, 1, { fit: "inside" }).png().toBuffer();
    const materialized =
      metadata.format === "svg" ? new Uint8Array(await image.png().toBuffer()) : body;
    const mediaType = metadata.format === "svg" ? "image/png" : expected.mediaType;
    return {
      dataUrl: `data:${mediaType};base64,${Buffer.from(materialized).toString("base64")}`,
      sizeBytes: materialized.byteLength,
    };
  } catch {
    return undefined;
  }
}

export async function extractPresentationPptdAssets(
  files: readonly ExtractedFile[],
  requestedPaths: readonly string[],
): Promise<Array<string | undefined>> {
  if (new Set(requestedPaths).size !== requestedPaths.length) {
    throw new Error("presentation_editor_asset_path_conflict");
  }
  const entrypoint = presentationEntrypoint(files);
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const assetPaths = requestedPaths.map((requestedPath) =>
    resolvePresentationAssetPath(entrypoint.path, requestedPath),
  );
  const canonicalPaths = assetPaths.filter((assetPath): assetPath is string => assetPath !== null);
  if (new Set(canonicalPaths).size !== canonicalPaths.length) {
    throw new Error("presentation_editor_asset_path_conflict");
  }
  const assets: Array<string | undefined> = [];
  let totalBytes = 0;
  for (const assetPath of assetPaths) {
    const asset = assetPath ? filesByPath.get(assetPath) : undefined;
    if (!asset) {
      assets.push(undefined);
      continue;
    }
    const materialized = await materializePresentationPptdAsset(asset.path, asset.body);
    if (!materialized) {
      assets.push(undefined);
      continue;
    }
    totalBytes += materialized.sizeBytes;
    if (totalBytes > PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES) {
      throw new Error("presentation_editor_assets_too_large");
    }
    assets.push(materialized.dataUrl);
  }
  return assets;
}

export async function runPresentationPipeline(input: { archive: Uint8Array; summary: string }) {
  const extracted = await readPresentationSourceArchive(input.archive);
  // The skill's converter leaves a rendered .pptx beside the .pptd project.
  // Spectra delivers only the editable source, so drop the binary before it is
  // indexed in the source manifest or re-archived for storage.
  const files = extracted.filter((file) => !file.path.toLowerCase().endsWith(".pptx"));
  const project = presentationProject(files);
  const sourceManifest = presentationSourceManifestSchema.parse({
    entrypoint: sourcePath(project.entrypointFile.path),
    files: files.map((file) => ({
      path: sourcePath(file.path),
      sha256: sha256(file.body),
      sizeBytes: file.body.byteLength,
    })),
    schemaVersion: 1,
  });
  const sourceArchive = await deterministicPresentationSourceArchive(files);
  return {
    content: presentationRevisionContentSchema.parse({
      schemaVersion: 1,
      pageCount: project.project.pages.length,
      pageTitles: project.pageTitles,
      summary: input.summary.trim().slice(0, 4_000),
      title: projectTitle(project.entrypoint, project.project.title),
    }),
    sourceArchive,
    sourceArchiveSha256: sha256(sourceArchive),
    sourceManifest,
  };
}
