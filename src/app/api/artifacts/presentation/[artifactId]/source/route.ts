import { z } from "zod";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { getPresentationEditorSource } from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    revisionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    revisionId: url.searchParams.get("revisionId"),
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const source = await getPresentationEditorSource(actor, {
      artifactId,
      ...query.data,
    });
    if (!source) {
      return Response.json({ detail: { code: "presentation_not_found" } }, { status: 404 });
    }
    const payload =
      source.kind === "saved-project"
        ? {
            ...source,
            payloadUrl: `/api/artifacts/presentation/${artifactId}/editor-project?${new URLSearchParams(
              query.data,
            ).toString()}`,
          }
        : source;
    return Response.json(payload, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof PresentationError) {
      return Response.json({ detail: { code: error.code } }, { status: 404 });
    }
    return Response.json({ detail: { code: "presentation_source_unavailable" } }, { status: 503 });
  }
}
