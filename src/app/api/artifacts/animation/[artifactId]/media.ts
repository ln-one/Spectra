import { z } from "zod";
import { AnimationError } from "@/features/artifacts/animations/errors";
import {
  type AnimationRenderFormat,
  getAnimationRender,
} from "@/features/artifacts/animations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    revisionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export function animationMediaResponse(
  object: {
    body: Uint8Array;
    contentType: string;
    filename?: string;
    range?: { end: number; start: number };
    sizeBytes: number;
  },
  download = false,
) {
  const response = new Response(object.body.slice().buffer, {
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-length": String(object.body.byteLength),
      "content-type": object.contentType,
      ...(object.range
        ? {
            "content-range": `bytes ${object.range.start}-${object.range.end}/${object.sizeBytes}`,
          }
        : {}),
    },
    status: object.range ? 206 : 200,
  });
  if (download) {
    response.headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(object.filename ?? "animation")}`,
    );
  }
  return response;
}

export async function animationMediaRoute(
  request: Request,
  params: Promise<{ artifactId: string }>,
  format: AnimationRenderFormat,
  download = false,
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    revisionId: url.searchParams.get("revisionId"),
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success) {
    return Response.json({ detail: { code: "animation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const object = await getAnimationRender(
      actor,
      {
        artifactId,
        format,
        ...query.data,
        ...(format === "mp4" && !download
          ? { range: request.headers.get("range") ?? "bytes=0-" }
          : {}),
      },
      { allowPublishedSource: !download },
    );
    if (!object) {
      return Response.json({ detail: { code: "animation_not_found" } }, { status: 404 });
    }
    if (object.unsatisfied) {
      return new Response(null, {
        headers: { "content-range": `bytes */${object.sizeBytes}` },
        status: 416,
      });
    }
    return animationMediaResponse(object, download);
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof AnimationError) {
      return Response.json({ detail: { code: error.code } }, { status: 404 });
    }
    return Response.json({ detail: { code: "animation_media_unavailable" } }, { status: 503 });
  }
}
