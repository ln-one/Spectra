import { z } from "zod";
import { gameHttpError } from "@/features/artifacts/games/http";
import { createGameRevivalRound } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; deathId: string; runId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, deathId, runId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json(
      await createGameRevivalRound(actor, { artifactId, deathId, runId, ...query.data }),
    );
  } catch (error) {
    return gameHttpError(error);
  }
}
