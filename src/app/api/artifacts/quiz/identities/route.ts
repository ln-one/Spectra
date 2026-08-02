import { z } from "zod";
import { quizHttpError } from "@/features/artifacts/quizzes/http";
import { issueQuizEntityIds } from "@/features/artifacts/quizzes/service";
import { getCurrentActor } from "@/features/identity/current";

const bodySchema = z
  .object({ count: z.number().int().min(1).max(16), workspaceId: z.string().uuid() })
  .strict();

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ detail: { code: "quiz_invalid" } }, { status: 400 });
  try {
    const actor = await getCurrentActor();
    return Response.json({ ids: await issueQuizEntityIds(actor, body.data) });
  } catch (error) {
    return quizHttpError(error);
  }
}
