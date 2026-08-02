import { z } from "zod";
import { quizRevisionContentSchema } from "@/features/artifacts/quizzes/contract";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { saveQuizRevision } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z
  .object({ conversationId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict();
const bodySchema = z
  .object({ content: quizRevisionContentSchema, expectedRevisionId: z.string().uuid() })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!query.success || !body.success)
    return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    const artifact = await saveQuizRevision(actor, { artifactId, ...query.data, ...body.data });
    return Response.json({ artifact });
  } catch (error) {
    return quizHttpError(error);
  }
}
