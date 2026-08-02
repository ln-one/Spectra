import { z } from "zod";
import { agentClientRequestIdSchema } from "@/features/agents/request";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { abortAiRun } from "@/features/agents/run-cancellation";
import { requestAiRunCancellationByClientRequest } from "@/features/agents/runs";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById } from "@/features/workspaces/service";
import { webLogger } from "@/observability/server";

const querySchema = z
  .object({
    clientRequestId: agentClientRequestIdSchema,
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function DELETE(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ detail: { code: "invalid_agent_run_request" } }, { status: 400 });
  }
  try {
    const actor = await getCurrentActor();
    const workspace = await getWorkspaceById(actor, parsed.data.workspaceId);
    const run = await requestAiRunCancellationByClientRequest({
      clientRequestId: parsed.data.clientRequestId,
      conversationId: parsed.data.conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId: workspace.id,
    });
    if (!run) {
      return Response.json({ detail: { code: "agent_run_not_found" } }, { status: 404 });
    }
    abortAiRun(run.id);
    try {
      const streamContext = await agentResumableStreamContext();
      await streamContext.delete(run.id);
    } catch (error) {
      webLogger.error(
        {
          conversationId: parsed.data.conversationId,
          error,
          event: "agent.stream.delete_failed",
          runId: run.id,
          workspaceId: workspace.id,
        },
        "Unable to delete cancelled agent stream",
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof WorkspaceError) {
      return Response.json({ detail: { code: "workspace_not_found" } }, { status: 404 });
    }
    return Response.json({ detail: { code: "agent_unavailable" } }, { status: 503 });
  }
}
