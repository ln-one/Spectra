import { z } from "zod";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import {
  getPresentationEditorProject,
  requirePresentationEditorArtifactManage,
  savePresentationEditorProject,
} from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    revisionId: z.string().uuid().optional(),
    workspaceId: z.string().uuid(),
  })
  .strict();
const MAX_EDITOR_MULTIPART_BYTES = 80 * 1024 * 1024;
const editorProjectFieldsSchema = z
  .object({
    expectedRevisionId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { detail: { code: error.code } },
      { status: error.code === "authentication_required" ? 401 : 403 },
    );
  }
  if (error instanceof PresentationError) {
    const status = {
      presentation_editor_project_invalid: 400,
      presentation_not_found: 404,
      presentation_not_retryable: 409,
      presentation_revision_conflict: 409,
      presentation_refinement_invalid: 400,
      presentation_refinement_stale: 409,
      presentation_source_unavailable: 503,
      presentation_runtime_unavailable: 503,
    }[error.code];
    return Response.json({ detail: { code: error.code } }, { status });
  }
  return Response.json(
    { detail: { code: "presentation_editor_project_unavailable" } },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    revisionId: url.searchParams.get("revisionId") ?? undefined,
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success || !query.data.revisionId) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const project = await getPresentationEditorProject(actor, {
      artifactId,
      conversationId: query.data.conversationId,
      revisionId: query.data.revisionId,
      workspaceId: query.data.workspaceId,
    });
    if (!project) {
      return Response.json({ detail: { code: "presentation_not_found" } }, { status: 404 });
    }
    const responseBody = new ArrayBuffer(project.body.byteLength);
    new Uint8Array(responseBody).set(project.body);
    return new Response(responseBody, {
      headers: {
        "cache-control": "private, no-store",
        "content-length": String(responseBody.byteLength),
        "content-type": project.contentType,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse({
    conversationId: url.searchParams.get("conversationId"),
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!query.success) {
    return Response.json({ detail: { code: "presentation_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    await requirePresentationEditorArtifactManage(actor, {
      artifactId,
      conversationId: query.data.conversationId,
      workspaceId: query.data.workspaceId,
    });
    const contentLength = Number(request.headers.get("content-length"));
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > MAX_EDITOR_MULTIPART_BYTES
    ) {
      return Response.json(
        { detail: { code: "presentation_editor_project_too_large" } },
        { status: 413 },
      );
    }
    const formData = await request.formData();
    const expectedRevisionId = formData.get("expectedRevisionId");
    const name = formData.get("name");
    const project = formData.get("pptJson");
    const cover = formData.get("coverImage");
    const pptdSource = formData.get("pptdSource");
    const fields = editorProjectFieldsSchema.safeParse({ expectedRevisionId, name });
    if (
      !fields.success ||
      !(project instanceof Blob) ||
      (cover !== null && !(cover instanceof Blob))
    ) {
      throw new PresentationError("presentation_editor_project_invalid");
    }
    let source: unknown;
    if (pptdSource !== null) {
      if (typeof pptdSource !== "string") {
        throw new PresentationError("presentation_editor_project_invalid");
      }
      try {
        source = JSON.parse(pptdSource);
      } catch (error) {
        throw new PresentationError("presentation_editor_project_invalid", { cause: error });
      }
    }
    const detail = await savePresentationEditorProject(actor, {
      artifactId,
      conversationId: query.data.conversationId,
      ...(cover
        ? {
            cover: {
              body: new Uint8Array(await cover.arrayBuffer()),
              mediaType: cover.type,
            },
          }
        : {}),
      expectedRevisionId: fields.data.expectedRevisionId,
      name: fields.data.name,
      project: {
        body: new Uint8Array(await project.arrayBuffer()),
        mediaType: project.type,
      },
      ...(source === undefined ? {} : { source }),
      workspaceId: query.data.workspaceId,
    });
    return Response.json(
      { detail },
      { headers: { "cache-control": "private, no-store" }, status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
