import { z } from "zod";
import { gameHttpError } from "@/features/artifacts/games/http";
import { getGameOverview } from "@/features/artifacts/games/run-service";
import { getCurrentActor } from "@/features/identity/current";

const querySchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ detail: { code: "game_invalid" } }, { status: 400 });
  try {
    const [{ artifactId }, actor] = await Promise.all([params, getCurrentActor()]);
    return Response.json({ overview: await getGameOverview(actor, { artifactId, ...query.data }) });
  } catch (error) {
    return gameHttpError(error);
  }
}
