import "server-only";

import { openHandsAuthoringEnvironment } from "@/features/artifacts/task-agent/config.server";
import {
  createOpenHandsAuthoringClient,
  type OpenHandsAuthoringClient,
} from "@/features/artifacts/task-agent/openhands-client.server";
import type { Actor } from "@/features/identity/types";
import {
  PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS,
  PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES,
} from "./editor-policy";
import { PresentationError } from "./errors";
import { materializePresentationPptdAsset, resolvePresentationAssetPath } from "./pipeline.server";
import { getPresentationDetailForConversation } from "./service";

const DRAFT_ENTRYPOINT = "out/presentation/presentation.pptd";

type DraftAssetDependencies = {
  getDetail?: typeof getPresentationDetailForConversation;
  runtime?: (attemptId: string) => {
    client: OpenHandsAuthoringClient;
    workspaceRoot: string;
  };
};

export async function getPresentationDraftAssets(
  actor: Actor,
  input: {
    artifactId: string;
    attemptId: string;
    conversationId: string;
    paths: string[];
    workspaceId: string;
  },
  dependencies: DraftAssetDependencies = {},
): Promise<Array<string | undefined>> {
  const getDetail = dependencies.getDetail ?? getPresentationDetailForConversation;
  const detail = await getDetail(actor, {
    artifactId: input.artifactId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  if (detail.generationAttemptId !== input.attemptId || detail.generationState === "ready") {
    throw new PresentationError("presentation_not_found");
  }
  if (
    input.paths.length < 1 ||
    input.paths.length > PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS ||
    new Set(input.paths).size !== input.paths.length
  ) {
    throw new PresentationError("presentation_editor_project_invalid");
  }

  const resolvedPaths = input.paths.map((requestedPath) =>
    resolvePresentationAssetPath(DRAFT_ENTRYPOINT, requestedPath),
  );
  const canonicalPaths = resolvedPaths.filter((path): path is string => path !== null);
  if (
    canonicalPaths.length !== resolvedPaths.length ||
    new Set(canonicalPaths).size !== canonicalPaths.length
  ) {
    throw new PresentationError("presentation_editor_project_invalid");
  }

  let runtime: { client: OpenHandsAuthoringClient; workspaceRoot: string };
  try {
    if (dependencies.runtime) {
      runtime = dependencies.runtime(input.attemptId);
    } else {
      const environment = openHandsAuthoringEnvironment(
        undefined,
        "presentation-pptd-v1",
        input.attemptId,
      );
      runtime = {
        client: createOpenHandsAuthoringClient(environment),
        workspaceRoot: environment.workspaceRoot,
      };
    }
  } catch (error) {
    throw new PresentationError("presentation_runtime_unavailable", { cause: error });
  }
  const workspacePath = `${runtime.workspaceRoot}/${input.attemptId}`;
  let totalDownloadedBytes = 0;
  let totalMaterializedBytes = 0;
  const assets: Array<string | undefined> = [];
  for (const assetPath of canonicalPaths) {
    try {
      const body = await runtime.client.downloadFile({
        maxBytes: PRESENTATION_EDITOR_MAX_IMAGE_BYTES,
        path: `${workspacePath}/${assetPath}`,
      });
      totalDownloadedBytes += body.byteLength;
      if (totalDownloadedBytes > PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES) {
        throw new PresentationError("presentation_editor_project_invalid");
      }
      const materialized = await materializePresentationPptdAsset(assetPath, body);
      if (!materialized) {
        assets.push(undefined);
        continue;
      }
      totalMaterializedBytes += materialized.sizeBytes;
      if (totalMaterializedBytes > PRESENTATION_EDITOR_MAX_SOURCE_ASSETS_BYTES) {
        throw new PresentationError("presentation_editor_project_invalid");
      }
      assets.push(materialized.dataUrl);
    } catch (error) {
      if (error instanceof PresentationError) throw error;
      assets.push(undefined);
    }
  }
  return assets;
}
