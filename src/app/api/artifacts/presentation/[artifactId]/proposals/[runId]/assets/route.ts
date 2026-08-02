import { z } from "zod";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { getPresentationProposalAssets } from "@/features/artifacts/presentations/refine-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();
const requestSchema = z
  .object({ paths: z.array(z.string().trim().min(1).max(500)).min(1).max(200) })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.paths).size !== value.paths.length) {
      context.addIssue({ code: "custom", message: "Presentation asset paths must be unique" });
    }
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; runId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const route = z
    .object({ artifactId: z.string().uuid(), runId: z.string().uuid() })
    .strict()
    .safeParse(await params);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!query.success || !route.success || !body.success) {
    return Response.json({ detail: { code: "presentation_refinement_invalid" } }, { status: 400 });
  }
  try {
    const actor = await getCurrentActor();
    const assets = await getPresentationProposalAssets(actor, {
      ...route.data,
      ...query.data,
      paths: body.data.paths,
    });
    return Response.json({ assets }, { headers: { "cache-control": "private, no-store" } });
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
