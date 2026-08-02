import { z } from "zod";
import { PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS } from "./editor-policy";

const draftAssetsResponseSchema = z
  .object({
    assets: z.array(z.string().startsWith("data:image/").nullable()),
  })
  .strict();

export type PresentationDraftAssetIdentity = {
  artifactId: string;
  attemptId: string;
  conversationId: string;
  workspaceId: string;
};

export async function resolvePresentationDraftAssets(
  identity: PresentationDraftAssetIdentity,
  paths: string[],
  fetchRequest: typeof fetch = globalThis.fetch,
): Promise<Array<string | undefined>> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length > PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS) {
    throw new Error("presentation_draft_assets_too_many");
  }
  const response = await fetchRequest(
    `/api/artifacts/presentation/${identity.artifactId}/draft-assets?${new URLSearchParams({
      attemptId: identity.attemptId,
      conversationId: identity.conversationId,
      workspaceId: identity.workspaceId,
    })}`,
    {
      body: JSON.stringify({ paths: uniquePaths }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("presentation_draft_assets_fetch_failed");
  const assets = draftAssetsResponseSchema.parse(await response.json()).assets;
  if (assets.length !== uniquePaths.length) {
    throw new Error("presentation_draft_assets_invalid");
  }
  const resolved = new Map(uniquePaths.map((path, index) => [path, assets[index]]));
  return paths.map((path) => resolved.get(path) ?? undefined);
}
