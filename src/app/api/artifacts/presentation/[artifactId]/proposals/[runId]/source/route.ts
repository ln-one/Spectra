import { z } from "zod";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { getPresentationProposalSource } from "@/features/artifacts/presentations/refine-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; runId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const route = z
    .object({ artifactId: z.string().uuid(), runId: z.string().uuid() })
    .strict()
    .safeParse(await params);
  if (!query.success || !route.success) {
    return Response.json({ detail: { code: "presentation_refinement_invalid" } }, { status: 400 });
  }
  try {
    const actor = await getCurrentActor();
    return Response.json(
      await getPresentationProposalSource(actor, { ...route.data, ...query.data }),
      { headers: { "cache-control": "private, no-store" } },
    );
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
    return Response.json(
      { detail: { code: "presentation_refinement_unavailable" } },
      { status: 503 },
    );
  }
}
