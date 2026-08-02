import { z } from "zod";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { checkQuizAttemptAnswer } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
const bodySchema = z.object({ questionId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; attemptId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!query.success || !body.success)
    return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, attemptId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json({
      feedback: await checkQuizAttemptAnswer(actor, {
        artifactId,
        attemptId,
        ...query.data,
        ...body.data,
      }),
    });
  } catch (error) {
    return quizHttpError(error);
  }
}
