import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { readAuthorizedKnowledgeVisualAsset } from "@/features/knowledge/visual-assets.server";

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
    const image = await readAuthorizedKnowledgeVisualAsset({
      actor: await getCurrentActor(),
      ...parsed.data,
    });
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(image.bytes);
          controller.close();
        },
      }),
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": image.mediaType,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof IdentityError) {
      return new Response(null, { status: error.code === "authentication_required" ? 401 : 403 });
    }
    return new Response(null, { status: 404 });
  }
}
