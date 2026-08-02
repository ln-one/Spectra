import { z } from "zod";
import { gameHttpError } from "@/features/artifacts/games/http";
import { abandonGameRun, getGameRun } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();
function query(request: Request) {
  return querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; runId: string }> },
) {
  const parsed = query(request);
  if (!parsed.success) return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, runId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json(await getGameRun(actor, { artifactId, runId, ...parsed.data }));
  } catch (error) {
    return gameHttpError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ artifactId: string; runId: string }> },
) {
  const parsed = query(request);
  if (!parsed.success) return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId, runId }, actor] = await Promise.all([params, getCurrentActor()]);
    await abandonGameRun(actor, { artifactId, runId, ...parsed.data });
    return new Response(null, { status: 204 });
  } catch (error) {
    return gameHttpError(error);
  }
}
