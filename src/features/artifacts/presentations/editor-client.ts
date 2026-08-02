import type { DeckelierSaveRequest } from "@deckelier/contracts";
import { z } from "zod";
import {
  PRESENTATION_EDITOR_IMAGE_MEDIA_TYPES,
  PRESENTATION_EDITOR_MAX_EMBEDDED_IMAGE_BYTES,
  PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS,
  PRESENTATION_EDITOR_PROJECT_MAX_BYTES,
  PRESENTATION_EDITOR_SOURCE_MAX_BYTES,
} from "./editor-policy";
import { presentationDetailSchema } from "./types";

const presentationEditorSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pptd"),
      pageMap: z.record(z.string(), z.string()),
      pptdContent: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("saved-project"),
      payloadUrl: z.string().min(1),
      title: z.string().min(1).max(200),
    })
    .strict(),
]);

const presentationEditorAssetsSchema = z
  .object({
    assets: z.array(z.string().startsWith("data:image/").nullable()),
  })
  .strict();

const presentationEditorSaveResponseSchema = z
  .object({
    detail: presentationDetailSchema,
  })
  .strict();

const presentationEditorUploadMediaTypes = new Set<string>(PRESENTATION_EDITOR_IMAGE_MEDIA_TYPES);

export interface PresentationEditorClientIdentity {
  artifactId: string;
  conversationId: string;
  revisionId: string;
  workspaceId: string;
}

export class PresentationEditorRevisionConflictError extends Error {
  constructor() {
    super("presentation_editor_revision_conflict");
    this.name = "PresentationEditorRevisionConflictError";
  }
}

function presentationEditorUrl(
  path: "editor-project" | "source" | "source-assets",
  identity: PresentationEditorClientIdentity,
  query: Record<string, string>,
) {
  return `/api/artifacts/presentation/${identity.artifactId}/${path}?${new URLSearchParams(
    query,
  ).toString()}`;
}

export function createPresentationEditorClient(
  identity: PresentationEditorClientIdentity,
  options: {
    fetch?: typeof fetch;
    readOnly: boolean;
  },
) {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  let currentRevisionId = identity.revisionId;
  const sourceAssetRevisionId = identity.revisionId;
  let sourceAssetsComplete = true;

  async function loadSource() {
    const response = await fetchRequest(
      presentationEditorUrl("source", identity, {
        conversationId: identity.conversationId,
        revisionId: currentRevisionId,
        workspaceId: identity.workspaceId,
      }),
    );
    if (!response.ok) throw new Error("presentation_source_fetch_failed");
    return presentationEditorSourceSchema.parse(await response.json());
  }

  async function resolveSourceAssets(paths: string[]): Promise<Array<string | undefined>> {
    try {
      const uniquePaths = [...new Set(paths)];
      if (uniquePaths.length > PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS) {
        throw new Error("presentation_source_assets_too_many");
      }
      const resolved = new Map<string, string>();
      const response = await fetchRequest(
        presentationEditorUrl("source-assets", identity, {
          conversationId: identity.conversationId,
          revisionId: sourceAssetRevisionId,
          workspaceId: identity.workspaceId,
        }),
        {
          body: JSON.stringify({ paths: uniquePaths }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("presentation_source_assets_fetch_failed");
      const assets = presentationEditorAssetsSchema.parse(await response.json()).assets;
      if (assets.length !== uniquePaths.length || assets.some((asset) => asset === null)) {
        throw new Error("presentation_source_asset_missing");
      }
      uniquePaths.forEach((path, index) => {
        const asset = assets[index];
        if (asset) resolved.set(path, asset);
      });
      return paths.map((path) => resolved.get(path));
    } catch (error) {
      sourceAssetsComplete = false;
      throw error;
    }
  }

  async function saveProject(payload: DeckelierSaveRequest) {
    if (options.readOnly) throw new Error("presentation_read_only");
    if (!sourceAssetsComplete) throw new Error("presentation_source_assets_incomplete");
    if (payload.pptJson.size > PRESENTATION_EDITOR_PROJECT_MAX_BYTES) {
      throw new Error("presentation_editor_project_too_large");
    }
    const serializedSource = payload.source ? JSON.stringify(payload.source) : undefined;
    if (
      serializedSource &&
      new TextEncoder().encode(serializedSource).byteLength > PRESENTATION_EDITOR_SOURCE_MAX_BYTES
    ) {
      throw new Error("presentation_editor_source_too_large");
    }
    const formData = new FormData();
    formData.set("expectedRevisionId", currentRevisionId);
    formData.set("name", payload.name);
    formData.set("pptJson", payload.pptJson);
    if (payload.coverImage) formData.set("coverImage", payload.coverImage);
    if (serializedSource) formData.set("pptdSource", serializedSource);
    const response = await fetchRequest(
      presentationEditorUrl("editor-project", identity, {
        conversationId: identity.conversationId,
        workspaceId: identity.workspaceId,
      }),
      { body: formData, method: "POST" },
    );
    if (response.status === 409) throw new PresentationEditorRevisionConflictError();
    if (!response.ok) throw new Error("presentation_editor_save_failed");
    const detail = presentationEditorSaveResponseSchema.parse(await response.json()).detail;
    if (detail.generationState !== "ready") {
      throw new Error("presentation_editor_save_invalid");
    }
    currentRevisionId = detail.artifact.currentRevision.id;
    return detail;
  }

  return {
    loadSource,
    resolveSourceAssets,
    saveProject,
  };
}

function materializePresentationEditorImage(file: File) {
  if (
    file.size < 1 ||
    file.size > PRESENTATION_EDITOR_MAX_IMAGE_BYTES ||
    !presentationEditorUploadMediaTypes.has(file.type)
  ) {
    throw new Error("presentation_image_upload_invalid");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("presentation_image_upload_failed"));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        reject(new Error("presentation_image_upload_failed"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function createPresentationEditorImageMaterializer(
  maxTotalBytes = PRESENTATION_EDITOR_MAX_EMBEDDED_IMAGE_BYTES,
  materialize = materializePresentationEditorImage,
) {
  let materializedBytes = 0;
  return async (file: File) => {
    const image = await materialize(file);
    const imageBytes = new TextEncoder().encode(image).byteLength;
    if (materializedBytes + imageBytes > maxTotalBytes) {
      throw new Error("presentation_image_upload_budget_exceeded");
    }
    materializedBytes += imageBytes;
    return image;
  };
}
