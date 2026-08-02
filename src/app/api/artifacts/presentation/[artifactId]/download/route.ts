import { z } from "zod";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { getPresentationPptxDownload } from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    revisionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    revisionId: url.searchParams.get("revisionId"),
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const download = await getPresentationPptxDownload(actor, {
      artifactId,
      ...query.data,
    });
    if (!download) {
      return Response.json({ detail: { code: "presentation_not_found" } }, { status: 404 });
    }
    const responseBody = new ArrayBuffer(download.body.byteLength);
    new Uint8Array(responseBody).set(download.body);
    return new Response(responseBody, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        "content-length": String(responseBody.byteLength),
        "content-type": download.contentType,
      },
    });
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
      { detail: { code: "presentation_download_unavailable" } },
      { status: 503 },
    );
  }
}
