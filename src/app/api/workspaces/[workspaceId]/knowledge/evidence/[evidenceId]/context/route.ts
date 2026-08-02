import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { knowledgeEvidenceContextSchema } from "@/features/knowledge/evidence-context";
import {
  KnowledgeEvidenceContextUnavailableError,
  readAuthorizedKnowledgeEvidenceContext,
} from "@/features/knowledge/evidence-context.server";
import { safeLogError, webLogger } from "@/observability/server";

const paramsSchema = z
  .object({ workspaceId: z.string().uuid(), evidenceId: z.string().uuid() })
  .strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; evidenceId: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404 });
  try {
    const context = await readAuthorizedKnowledgeEvidenceContext({
      actor: await getCurrentActor(),
      ...parsed.data,
    });
    return Response.json(knowledgeEvidenceContextSchema.parse(context), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof IdentityError) {
      return new Response(null, { status: error.code === "authentication_required" ? 401 : 403 });
    }
    if (error instanceof KnowledgeEvidenceContextUnavailableError) {
      return new Response(null, { status: 404 });
    }
    webLogger.error(
      {
        component: "knowledge-evidence-context",
        error: safeLogError(error),
        event: "knowledge.evidence_context.failed",
        failureCode: "knowledge_evidence_context_failed",
        workspaceId: parsed.data.workspaceId,
      },
      "Knowledge evidence context request failed",
    );
    return new Response(null, { status: 503 });
  }
}
