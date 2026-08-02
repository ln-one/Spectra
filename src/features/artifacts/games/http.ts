import "server-only";

import { IdentityError } from "@/features/identity/errors";
import { GameError } from "./errors";

export function gameHttpError(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { detail: { code: error.code } },
      { status: error.code === "authentication_required" ? 401 : 403 },
    );
  }
  if (error instanceof GameError) {
    const status = error.code.endsWith("conflict")
      ? 409
      : error.code === "game_revival_unavailable"
        ? 422
        : 404;
    return Response.json({ detail: { code: error.code } }, { status });
  }
  return Response.json({ detail: { code: "game_unavailable" } }, { status: 503 });
}
