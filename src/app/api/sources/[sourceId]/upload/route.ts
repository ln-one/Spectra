import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { SourceError } from "@/features/sources/errors";
import { uploadSourceObject } from "@/features/sources/upload-proxy.server";
import { MAX_SOURCE_FILE_BYTES } from "@/features/sources/validation";

const querySchema = z.object({ generation: z.coerce.number().int().positive() }).strict();

function sourceErrorStatus(error: SourceError) {
  if (error.code === "source_not_found") return 404;
  if (error.code === "source_file_too_large") return 413;
  if (error.code === "source_storage_unavailable") return 503;
  return 409;
}

export async function PUT(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  try {
    const [{ sourceId }, actor] = await Promise.all([params, getCurrentActor()]);
    const url = new URL(request.url);
    const query = querySchema.safeParse({ generation: url.searchParams.get("generation") });
    if (!query.success) {
      return Response.json({ detail: { code: "source_input_invalid" } }, { status: 400 });
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_FILE_BYTES) {
      return Response.json({ detail: { code: "source_file_too_large" } }, { status: 413 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > MAX_SOURCE_FILE_BYTES) {
      return Response.json({ detail: { code: "source_file_too_large" } }, { status: 413 });
    }
    await uploadSourceObject(
      actor,
      sourceId,
      query.data.generation,
      body,
      request.headers.get("content-type") ?? "application/octet-stream",
    );
    // Uppy AWS S3 treats a successful PUT without an ETag header as incomplete
    // and never emits `upload-success`, even though the object was stored.
    // The completion action independently inspects the stored object, so this
    // opaque proxy ETag is only the acknowledgement Uppy requires.
    return new Response(null, { headers: { ETag: '"spectra-upload-proxy"' }, status: 204 });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof SourceError) {
      return Response.json({ detail: { code: error.code } }, { status: sourceErrorStatus(error) });
    }
    return Response.json({ detail: { code: "source_action_failed" } }, { status: 503 });
  }
}
