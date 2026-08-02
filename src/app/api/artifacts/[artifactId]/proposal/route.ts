import { z } from "zod";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  dismissCurrentArtifactEditProposal,
  getCurrentArtifactEditProposal,
} from "@/features/artifacts/proposal-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const paramsSchema = z.object({ artifactId: z.string().uuid() }).strict();
const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    runId: z.string().uuid().optional(),
    workspaceId: z.string().uuid(),
  })
  .strict();
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function errorResponse(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { detail: { code: error.code } },
      {
        headers: NO_STORE_HEADERS,
        status: error.code === "authentication_required" ? 401 : 403,
      },
    );
  }
  if (error instanceof ArtifactError) {
    const status = error.code === "artifact_not_found" ? 404 : 409;
    return Response.json({ detail: { code: error.code } }, { headers: NO_STORE_HEADERS, status });
  }
  return Response.json(
    { detail: { code: "artifact_proposal_unavailable" } },
    { headers: NO_STORE_HEADERS, status: 503 },
  );
}

async function requestInput(request: Request, params: Promise<{ artifactId: string }>) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const routeParams = paramsSchema.safeParse(await params);
  return query.success && routeParams.success ? { ...query.data, ...routeParams.data } : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const input = await requestInput(request, params);
  if (!input) {
    return Response.json(
      { detail: { code: "artifact_proposal_invalid" } },
      { headers: NO_STORE_HEADERS, status: 400 },
    );
  }
  try {
    const actor = await getCurrentActor();
    const proposal = await getCurrentArtifactEditProposal(actor, input);
    return Response.json({ proposal }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const input = await requestInput(request, params);
  const runId = input?.runId;
  if (!input || !runId) {
    return Response.json(
      { detail: { code: "artifact_proposal_invalid" } },
      { headers: NO_STORE_HEADERS, status: 400 },
    );
  }
  try {
    const actor = await getCurrentActor();
    await dismissCurrentArtifactEditProposal(actor, { ...input, runId });
    return new Response(null, { headers: NO_STORE_HEADERS, status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
