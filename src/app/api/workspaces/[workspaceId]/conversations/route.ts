import { z } from "zod";
import {
  type AiConversationCursor,
  decodeAiConversationCursor,
} from "@/features/agents/conversation-records";
import { listWorkspaceConversationPage } from "@/features/agents/server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";
import { workspaceConversationPageSchema } from "@/features/workspaces/workbench/read-contract";

const paramsSchema = z.object({ workspaceId: z.string().uuid() }).strict();
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return new Response(null, { headers: NO_STORE_HEADERS, status: 404 });
  const url = new URL(request.url);
  const afterValues = url.searchParams.getAll("after");
  if (afterValues.length > 1) {
    return Response.json(
      { detail: { code: "invalid_cursor" } },
      { headers: NO_STORE_HEADERS, status: 400 },
    );
  }
  const [after] = afterValues;
  let cursor: AiConversationCursor | undefined;
  if (afterValues.length === 1 && after !== undefined) {
    const decoded = decodeAiConversationCursor(after);
    if (!decoded) {
      return Response.json(
        { detail: { code: "invalid_cursor" } },
        { headers: NO_STORE_HEADERS, status: 400 },
      );
    }
    cursor = decoded;
  }
  try {
    const page = await listWorkspaceConversationPage({
      actor: await getCurrentActor(),
      ...(cursor ? { cursor } : {}),
      workspaceId: parsedParams.data.workspaceId,
    });
    return Response.json(workspaceConversationPageSchema.parse(page), {
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
