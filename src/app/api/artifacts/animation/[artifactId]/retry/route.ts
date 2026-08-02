import { z } from "zod";
import { createAnimationDbosQueue } from "@/features/artifacts/animations/dbos";
import { AnimationError } from "@/features/artifacts/animations/errors";
import { retryAnimationGeneration } from "@/features/artifacts/animations/service";
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
    return Response.json({ detail: { code: "animation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const detail = await retryAnimationGeneration(
      actor,
      { artifactId, ...body.data },
      createAnimationDbosQueue(),
    );
    return Response.json({ detail }, { status: 202 });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof AnimationError) {
      return Response.json(
        { detail: { code: error.code } },
        {
          status:
            error.code === "animation_not_found"
              ? 404
              : error.code === "animation_runtime_unavailable"
                ? 503
                : 409,
        },
      );
    }
    return Response.json({ detail: { code: "animation_retry_unavailable" } }, { status: 503 });
  }
}
