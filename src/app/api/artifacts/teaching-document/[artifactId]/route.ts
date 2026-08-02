import { z } from "zod";
import { teachingDocumentRevisionContentSchema } from "@/features/artifacts/documents/contract";
import { TeachingDocumentError } from "@/features/artifacts/documents/errors";
import { saveTeachingDocumentRevision } from "@/features/artifacts/documents/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const requestSchema = z
  .object({
    content: teachingDocumentRevisionContentSchema,
    expectedRevisionId: z.string().uuid(),
  })
  .strict();

const querySchema = z
  .object({
    conversationId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedQuery.success || !parsedBody.success) {
    return Response.json({ detail: { code: "teaching_document_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const artifact = await saveTeachingDocumentRevision(actor, {
      artifactId,
      ...parsedBody.data,
      ...parsedQuery.data,
    });
    return Response.json({ artifact });
  } catch (error) {
    if (error instanceof IdentityError) {
      const status = error.code === "authentication_required" ? 401 : 403;
      return Response.json({ detail: { code: error.code } }, { status });
    }
    if (error instanceof TeachingDocumentError) {
      const status = error.code === "teaching_document_conflict" ? 409 : 404;
      return Response.json({ detail: { code: error.code } }, { status });
    }
    return Response.json({ detail: { code: "teaching_document_unavailable" } }, { status: 503 });
  }
}
