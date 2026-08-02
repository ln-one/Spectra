import { z } from "zod";
import { TeachingDocumentError } from "@/features/artifacts/documents/errors";
import {
  artifactRenderJobSchema,
  ensureTeachingDocumentRenderJob,
  getArtifactRenderDownload,
  getTeachingDocumentRenderJob,
} from "@/features/artifacts/render-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const revisionIdSchema = z.string().uuid();

async function handle(
  request: Request,
  params: Promise<{ artifactId: string }>,
  method: "GET" | "POST",
) {
  const requestUrl = new URL(request.url);
  const revisionId = requestUrl.searchParams.get("revisionId");
  const wantsDownload = method === "GET" && requestUrl.searchParams.get("download") === "1";
  if (!revisionIdSchema.safeParse(revisionId).success) {
    return Response.json({ detail: { code: "teaching_document_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const input = { artifactId, revisionId: revisionId as string };
    const job =
      method === "POST"
        ? await ensureTeachingDocumentRenderJob(actor, input)
        : await getTeachingDocumentRenderJob(actor, input);
    if (!job) {
      return Response.json(
        { detail: { code: "teaching_document_export_not_found" } },
        { status: 404 },
      );
    }
    if (wantsDownload) {
      const download = job.state === "ready" ? await getArtifactRenderDownload(actor, input) : null;
      if (!download) {
        return Response.json(
          { detail: { code: "teaching_document_export_not_found" } },
          { status: 404 },
        );
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
    }
    const downloadUrl = job.state === "ready" ? new URL(requestUrl) : null;
    downloadUrl?.searchParams.set("download", "1");
    return Response.json(
      {
        downloadUrl: downloadUrl?.toString() ?? null,
        job: artifactRenderJobSchema.parse({
          artifactId: job.artifactId,
          artifactRevisionId: job.artifactRevisionId,
          attemptNumber: job.attemptNumber,
          failureCode: job.failureCode,
          format: job.format,
          id: job.id,
          state: job.state,
        }),
      },
      { status: downloadUrl ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof TeachingDocumentError) {
      return Response.json({ detail: { code: error.code } }, { status: 404 });
    }
    return Response.json(
      { detail: { code: "teaching_document_export_unavailable" } },
      { status: 503 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  return handle(request, params, "GET");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  return handle(request, params, "POST");
}
