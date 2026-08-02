import { z } from "zod";
import { createPresentationDbosQueue } from "@/features/artifacts/presentations/dbos";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { retryPresentationGeneration } from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const bodySchema = z
  .object({
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const detail = await retryPresentationGeneration(
      actor,
      { artifactId, ...body.data },
      createPresentationDbosQueue(),
    );
    return Response.json({ detail }, { status: 202 });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof PresentationError) {
      if (error.code === "presentation_runtime_unavailable") {
        return Response.json({ detail: { code: error.code } }, { status: 503 });
      }
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "presentation_not_found" ? 404 : 409 },
      );
    }
    return Response.json({ detail: { code: "presentation_retry_unavailable" } }, { status: 503 });
  }
}
