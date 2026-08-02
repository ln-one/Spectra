import { z } from "zod";
import { getPresentationDraftAssets } from "@/features/artifacts/presentations/draft-assets.server";
import { PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS } from "@/features/artifacts/presentations/editor-policy";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const MAX_REQUEST_BYTES = 320 * 1024;
const querySchema = z
  .object({
    attemptId: z.string().uuid(),
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();
const requestSchema = z
  .object({
    paths: z
      .array(z.string().min(1).max(500))
      .min(1)
      .max(PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS),
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.paths).size !== request.paths.length) {
      context.addIssue({
        code: "custom",
        message: "Presentation asset paths must be unique",
      });
    }
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    attemptId: url.searchParams.get("attemptId"),
    conversationId: url.searchParams.get("conversationId"),
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
    }
    const input = requestSchema.safeParse(JSON.parse(body));
    if (!input.success) {
      return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
    }
    const assets = await getPresentationDraftAssets(actor, {
      artifactId,
      ...query.data,
      paths: input.data.paths,
    });
    return Response.json({ assets }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
    }
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof PresentationError) {
      const status = error.code === "presentation_runtime_unavailable" ? 503 : 404;
      return Response.json({ detail: { code: error.code } }, { status });
    }
    return Response.json({ detail: { code: "presentation_runtime_unavailable" } }, { status: 503 });
  }
}
