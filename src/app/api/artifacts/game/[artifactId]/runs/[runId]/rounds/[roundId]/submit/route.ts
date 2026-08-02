import { z } from "zod";
import { gameRevivalSubmissionSchema } from "@/features/artifacts/games/contract";
import { gameHttpError } from "@/features/artifacts/games/http";
import { submitGameRevivalRound } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; roundId: string; runId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const submission = await request
    .json()
    .then((value: unknown) => gameRevivalSubmissionSchema.safeParse(value))
    .catch(() => null);
  if (!query.success || !submission?.success)
    return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, roundId, runId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json(
      await submitGameRevivalRound(actor, {
        artifactId,
        roundId,
        runId,
        submission: submission.data,
        ...query.data,
      }),
    );
  } catch (error) {
    return gameHttpError(error);
  }
}
