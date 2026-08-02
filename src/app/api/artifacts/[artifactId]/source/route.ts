import { z } from "zod";
import { publishArtifactSource } from "@/features/artifacts/artifact-source-membership.server";
import { ArtifactError } from "@/features/artifacts/errors";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ detail: { code: "artifact_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const membership = await publishArtifactSource(actor, {
      artifactId,
      ...parsed.data,
    });
    return Response.json({ source: membership.source }, { status: 201 });
  } catch (error) {
    if (error instanceof IdentityError) {
      const status = error.code === "authentication_required" ? 401 : 403;
      return Response.json({ detail: { code: error.code } }, { status });
    }
    if (error instanceof ArtifactError) {
      return Response.json({ detail: { code: "artifact_not_found" } }, { status: 404 });
    }
    return Response.json({ detail: { code: "artifact_source_unavailable" } }, { status: 503 });
  }
}
