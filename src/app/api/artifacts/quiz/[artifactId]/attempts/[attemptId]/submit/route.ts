import { z } from "zod";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { submitQuizAttempt } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; attemptId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, attemptId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json({
      attempt: await submitQuizAttempt(actor, { artifactId, attemptId, ...query.data }),
    });
  } catch (error) {
    return quizHttpError(error);
  }
}
