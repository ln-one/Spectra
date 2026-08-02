import { z } from "zod";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { listQuizAttempts, startQuizAttempt } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();

function query(request: Request) {
  return querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const parsed = query(request);
  if (!parsed.success) return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json({
      attempts: await listQuizAttempts(actor, { artifactId, ...parsed.data }),
    });
  } catch (error) {
    return quizHttpError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const parsed = query(request);
  if (!parsed.success) return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json({
      attempt: await startQuizAttempt(actor, { artifactId, ...parsed.data }),
    });
  } catch (error) {
    return quizHttpError(error);
  }
}
