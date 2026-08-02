import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { RESUMABLE_STREAM_ID_HEADER } from "assistant-stream/resumable";
import { after } from "next/server";
import { z } from "zod";
import {
  clearAiConversationActiveStream,
  findAiConversation,
} from "@/features/agents/conversation-records";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById } from "@/features/workspaces/service";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
const paramsSchema = z.object({ conversationId: z.string().uuid() }).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsed.success || !parsedParams.success) {
    return Response.json({ detail: { code: "invalid_agent_stream_request" } }, { status: 400 });
  }

  try {
    const actor = await getCurrentActor();
    const workspace = await getWorkspaceById(actor, parsed.data.workspaceId);
    const conversation = await findAiConversation({
      conversationId: parsedParams.data.conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId: workspace.id,
    });
    // A URL-owned thread can exist before its first message creates the
    // database row. AI SDK defines 204 as "nothing to resume"; a 404 would
    // incorrectly put the entire chat runtime into an error state.
    if (!conversation) return new Response(null, { status: 204 });
    if (!conversation.activeStreamId) return new Response(null, { status: 204 });

    const streamContext = await agentResumableStreamContext(after);
    const resumed = await streamContext.resume(conversation.activeStreamId);
    if (!resumed) {
      await clearAiConversationActiveStream({
        conversationId: conversation.conversationId,
        createdByPrincipalId: actor.principalId,
        streamId: conversation.activeStreamId,
        workspaceId: workspace.id,
      });
      return new Response(null, { status: 204 });
    }

    const headers = new Headers(UI_MESSAGE_STREAM_HEADERS);
    headers.set(RESUMABLE_STREAM_ID_HEADER, conversation.activeStreamId);
    headers.set("X-Spectra-Run-Id", conversation.activeStreamId);
    return new Response(resumed, { headers });
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
    return Response.json({ detail: { code: "agent_stream_unavailable" } }, { status: 503 });
  }
}
