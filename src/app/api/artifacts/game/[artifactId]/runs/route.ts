import { z } from "zod";
import { gameHttpError } from "@/features/artifacts/games/http";
import { startGameRun } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
const bodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(128),
    surfaceKey: z.string().trim().min(1).max(128),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const [query, body] = await Promise.all([
    Promise.resolve(querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))),
    request
      .json()
      .then((value: unknown) => bodySchema.safeParse(value))
      .catch(() => null),
  ]);
  if (!query.success || !body?.success)
    return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json(await startGameRun(actor, { artifactId, ...body.data, ...query.data }));
  } catch (error) {
    return gameHttpError(error);
  }
}
