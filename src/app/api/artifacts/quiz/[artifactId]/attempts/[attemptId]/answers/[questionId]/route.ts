import { z } from "zod";
import { quizAnswerSchema } from "@/features/artifacts/quizzes/contract";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { saveQuizAttemptAnswer } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
const bodySchema = z
  .object({
    answer: quizAnswerSchema,
    expectedVersion: z.number().int().min(0),
    flagged: z.boolean(),
  })
  .strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; attemptId: string; questionId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!query.success || !body.success)
    return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, attemptId, questionId }, actor] = await Promise.all([
      params,
      getCurrentActor(),
    ]);
    return Response.json({
      answer: await saveQuizAttemptAnswer(actor, {
        artifactId,
        attemptId,
        questionId,
        ...query.data,
        ...body.data,
      }),
    });
  } catch (error) {
    return quizHttpError(error);
  }
}
