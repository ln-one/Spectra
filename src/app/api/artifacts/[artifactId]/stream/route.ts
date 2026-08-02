import { z } from "zod";
import { artifactDraftEventSchema } from "@/features/artifacts/contract";
import { readArtifactDbosStream } from "@/features/artifacts/dbos-realtime.server";
import { ArtifactError } from "@/features/artifacts/errors";
import { getArtifactDetailForConversation } from "@/features/artifacts/workbench-server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    attemptId: z.string().uuid(),
    afterSequence: z.coerce.number().int().min(0).default(0),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ detail: { code: "artifact_stream_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const detail = await getArtifactDetailForConversation(actor, {
      artifactId,
      conversationId: parsed.data.conversationId,
      workspaceId: parsed.data.workspaceId,
    });
    if (detail.generationAttemptId !== parsed.data.attemptId) {
      return Response.json({ detail: { code: "artifact_stream_stale" } }, { status: 409 });
    }
    const resumed = await readArtifactDbosStream({
      attemptId: parsed.data.attemptId,
    });
    const encoder = new TextEncoder();
    const reader = resumed.stream.getReader();
    let lastSequence = parsed.data.afterSequence;
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await resumed.close();
    };
    return new Response(
      new ReadableStream<Uint8Array>({
        async cancel(reason) {
          await reader.cancel(reason).catch(() => undefined);
          await close();
        },
        async pull(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                await close();
                controller.close();
                return;
              }
              const event = artifactDraftEventSchema.parse(JSON.parse(value));
              if (event.kind !== detail.kind) throw new Error("artifact_stream_kind_mismatch");
              if (event.sequence <= lastSequence) continue;
              lastSequence = event.sequence;
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
              return;
            }
          } catch (error) {
            await close();
            controller.error(error);
          }
        },
      }),
      {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-Accel-Buffering": "no",
          "X-Artifact-Attempt-Id": parsed.data.attemptId,
        },
      },
    );
  } catch (error) {
    if (error instanceof IdentityError) {
      const status = error.code === "authentication_required" ? 401 : 403;
      return Response.json({ detail: { code: error.code } }, { status });
    }
    if (error instanceof ArtifactError || error instanceof WorkspaceError) {
      return Response.json({ detail: { code: "artifact_not_found" } }, { status: 404 });
    }
    return Response.json({ detail: { code: "artifact_stream_unavailable" } }, { status: 503 });
  }
}
