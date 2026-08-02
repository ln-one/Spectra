import { createUIMessageStreamResponse, UI_MESSAGE_STREAM_HEADERS } from "ai";
import { RESUMABLE_STREAM_ID_HEADER } from "assistant-stream/resumable";
import { after } from "next/server";
import {
  AGENT_CHAT_REQUEST_MAX_BYTES,
  AgentRequestTooLargeError,
  parseAgentChatRequest,
} from "@/features/agents/request";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { AiRunConflictError } from "@/features/agents/runs";
import { runWorkspaceTurn } from "@/features/agents/workspace-turn-service";
import { isArtifactError } from "@/features/artifacts/errors";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";

export const maxDuration = 120;

function errorResponse(code: string, status: number, runId?: string) {
  return Response.json({ detail: { code, ...(runId ? { runId } : {}) } }, { status });
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > AGENT_CHAT_REQUEST_MAX_BYTES) {
    throw new AgentRequestTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > AGENT_CHAT_REQUEST_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AgentRequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let parsed: Awaited<ReturnType<typeof parseAgentChatRequest>> = null;
  try {
    parsed = await parseAgentChatRequest(await readBoundedJson(request));
  } catch (error) {
    if (error instanceof AgentRequestTooLargeError) {
      return errorResponse(error.code, 413);
    }
    return errorResponse("invalid_agent_request", 400);
  }
  if (!parsed) return errorResponse("invalid_agent_request", 400);

  try {
    const actor = await getCurrentActor();
    const streamContext = await agentResumableStreamContext(after);
    const result = await runWorkspaceTurn({
      actor,
      request: parsed,
    });
    if (result.type === "error") {
      if (result.code === "agent_request_replayed" && result.runId) {
        const resumed = await streamContext.resume(result.runId);
        if (resumed) {
          const headers = new Headers(UI_MESSAGE_STREAM_HEADERS);
          headers.set(RESUMABLE_STREAM_ID_HEADER, result.runId);
          headers.set("X-Spectra-Run-Id", result.runId);
          return new Response(resumed, { headers });
        }
      }
      return errorResponse(result.code, result.status, result.runId);
    }
    const response = createUIMessageStreamResponse({
      ...(result.headers ? { headers: result.headers } : {}),
      stream: result.stream,
    });
    const runId = response.headers.get("x-spectra-run-id");
    const responseBody = response.body;
    if (!runId || !responseBody) return errorResponse("agent_stream_unavailable", 503);
    const stream = await streamContext.run(runId, () => responseBody);
    const headers = new Headers(response.headers);
    headers.set(RESUMABLE_STREAM_ID_HEADER, runId);
    return new Response(stream, { headers, status: response.status });
  } catch (error) {
    if (error instanceof AiRunConflictError) return errorResponse(error.code, 409);
    if (isArtifactError(error, "artifact_creation_conflict")) {
      return errorResponse("agent_conversation_conflict", 409);
    }
    if (error instanceof IdentityError) {
      if (error.code === "authentication_required") return errorResponse(error.code, 401);
      if (error.code === "principal_disabled") return errorResponse(error.code, 403);
      return errorResponse(error.code, 409);
    }
    if (error instanceof WorkspaceError) return errorResponse("workspace_not_found", 404);
    return errorResponse("agent_unavailable", 503);
  }
}
