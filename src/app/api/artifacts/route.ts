import { z } from "zod";
import { ArtifactError } from "@/features/artifacts/errors";
import { listArtifactHistory } from "@/features/artifacts/workbench-server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      { detail: { code: "artifact_invalid" } },
      { headers: NO_STORE_HEADERS, status: 400 },
    );
  }
  try {
    const actor = await getCurrentActor();
    const artifacts = await listArtifactHistory(actor, parsed.data);
    return Response.json({ artifacts }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof IdentityError) {
      const status = error.code === "authentication_required" ? 401 : 403;
      return Response.json({ detail: { code: error.code } }, { headers: NO_STORE_HEADERS, status });
    }
    if (error instanceof ArtifactError || error instanceof WorkspaceError) {
      return Response.json(
        { detail: { code: "artifact_not_found" } },
        { headers: NO_STORE_HEADERS, status: 404 },
      );
    }
    return Response.json(
      { detail: { code: "artifact_unavailable" } },
      { headers: NO_STORE_HEADERS, status: 503 },
    );
  }
}
