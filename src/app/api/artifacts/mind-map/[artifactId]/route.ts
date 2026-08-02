import { z } from "zod";
import { mindMapRevisionContentSchema } from "@/features/artifacts/mind-maps/contract";
import { MindMapError } from "@/features/artifacts/mind-maps/errors";
import { saveMindMapRevision } from "@/features/artifacts/mind-maps/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";

const requestSchema = z
  .object({ content: mindMapRevisionContentSchema, expectedRevisionId: z.string().uuid() })
  .strict();
const querySchema = z
  .object({ conversationId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!query.success || !body.success) {
    return Response.json({ detail: { code: "mind_map_invalid" } }, { status: 400 });
  }
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const artifact = await saveMindMapRevision(actor, {
      artifactId,
      ...body.data,
      ...query.data,
    });
    return Response.json({ artifact });
  } catch (error) {
    if (error instanceof IdentityError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "authentication_required" ? 401 : 403 },
      );
    }
    if (error instanceof MindMapError) {
      return Response.json(
        { detail: { code: error.code } },
        { status: error.code === "mind_map_conflict" ? 409 : 404 },
      );
    }
    return Response.json({ detail: { code: "mind_map_unavailable" } }, { status: 503 });
  }
}
