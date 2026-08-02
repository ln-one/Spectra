import { z } from "zod";
import { findAiConversation } from "@/features/agents/conversation-records";
import { decodeAiMessageCursor, loadAiMessagePage } from "@/features/agents/message-records";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { WorkspaceError } from "@/features/workspaces/errors";
import { workspaceMessagePageEnvelopeSchema } from "@/features/workspaces/workbench/read-contract";

const paramsSchema = z
  .object({ workspaceId: z.string().uuid(), conversationId: z.string().uuid() })
  .strict();
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; conversationId: string }>;
  },
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return new Response(null, { headers: NO_STORE_HEADERS, status: 404 });
  const url = new URL(request.url);
  const beforeValues = url.searchParams.getAll("before");
  if (beforeValues.length > 1) {
    return Response.json(
      { detail: { code: "invalid_cursor" } },
      { headers: NO_STORE_HEADERS, status: 400 },
    );
  }
  const [before] = beforeValues;
  let beforePosition: number | undefined;
  if (beforeValues.length === 1 && before !== undefined) {
    const decoded = decodeAiMessageCursor(before);
    if (decoded === null) {
      return Response.json(
        { detail: { code: "invalid_cursor" } },
        { headers: NO_STORE_HEADERS, status: 400 },
      );
    }
    beforePosition = decoded;
  }
  try {
    const actor = await getCurrentActor();
    await requireWorkspacePermission(actor, parsedParams.data.workspaceId, "workspace.chat");
    const conversation = await findAiConversation({
      conversationId: parsedParams.data.conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId: parsedParams.data.workspaceId,
    });
    if (!conversation) return new Response(null, { headers: NO_STORE_HEADERS, status: 404 });
    const page = await loadAiMessagePage({
      ...(beforePosition === undefined ? {} : { beforePosition }),
      conversationId: conversation.conversationId,
      workspaceId: parsedParams.data.workspaceId,
    });
    return Response.json(workspaceMessagePageEnvelopeSchema.parse(page), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { headers: NO_STORE_HEADERS, status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof WorkspaceError) {
      return new Response(null, { headers: NO_STORE_HEADERS, status: 404 });
    }
    return new Response(null, { headers: NO_STORE_HEADERS, status: 503 });
  }
}
