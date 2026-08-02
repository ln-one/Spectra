import { z } from "zod";
import { gameHttpError } from "@/features/artifacts/games/http";
import { reportGameDeath } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
const bodySchema = z
  .object({
    elapsedMs: z.number().int().min(0),
    flapCount: z.number().int().min(0),
    idempotencyKey: z.string().trim().min(1).max(128),
    score: z.number().int().min(0),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; runId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const body = await request
    .json()
    .then((value: unknown) => bodySchema.safeParse(value))
    .catch(() => null);
  if (!query.success || !body?.success)
    return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, runId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json(
      await reportGameDeath(actor, { artifactId, runId, ...body.data, ...query.data }),
    );
  } catch (error) {
    return gameHttpError(error);
  }
}
