import { z } from "zod";
import { enqueueArtifactSuggestions } from "@/features/artifacts/documents/suggestion-dbos";
import {
  artifactSuggestionContextHash,
  markArtifactSuggestionSnapshotRefreshing,
  readArtifactSuggestionSnapshot,
  reserveArtifactSuggestionRequest,
} from "@/features/artifacts/documents/suggestion-snapshots.server";
import { loadArtifactSuggestionContext } from "@/features/artifacts/documents/suggestions";
import { artifactSuggestionTargetSchema } from "@/features/artifacts/suggestions/contract";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { SourceError } from "@/features/sources/errors";
import { WorkspaceError } from "@/features/workspaces/errors";
import { webLogger } from "@/observability/server";

const requestSchema = z
  .object({
    afterGeneration: z.union([z.iso.datetime(), z.literal("missing")]).optional(),
    locale: z.enum(["zh-CN", "en-US"]),
    target: artifactSuggestionTargetSchema,
    waitOnly: z.literal("true").optional(),
    workspaceId: z.string().uuid(),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { detail: { code: error.code } },
      { status: error.code === "authentication_required" ? 401 : 403 },
    );
  }
  if (error instanceof WorkspaceError || error instanceof SourceError) {
    return Response.json({ detail: { code: "workspace_not_found" } }, { status: 404 });
  }
  return Response.json(
    { detail: { code: "artifact_suggestions_unavailable" }, status: "failed" },
    { status: 503 },
  );
}

async function respond(value: unknown, forceRefresh: boolean) {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    return Response.json(
      { detail: { code: "invalid_artifact_suggestion_request" } },
      { status: 400 },
    );
  }
  if (forceRefresh && parsed.data.afterGeneration === undefined) {
    return Response.json(
      { detail: { code: "invalid_artifact_suggestion_request" } },
      { status: 400 },
    );
  }
  try {
    const actor = await getCurrentActor();
    const context = await loadArtifactSuggestionContext(
      actor,
      parsed.data.workspaceId,
      parsed.data.locale,
      parsed.data.target,
    );
    const snapshot = await readArtifactSuggestionSnapshot(context);
    const contextHash = artifactSuggestionContextHash(context);
    const generation =
      snapshot.status === "fresh" || snapshot.status === "stale"
        ? snapshot.generatedAt.toISOString()
        : null;
    const requestedGeneration =
      parsed.data.afterGeneration === undefined || parsed.data.afterGeneration === "missing"
        ? null
        : parsed.data.afterGeneration;
    if (
      forceRefresh &&
      requestedGeneration !== generation &&
      (snapshot.status === "fresh" || snapshot.status === "stale")
    ) {
      return Response.json({
        generation,
        status: snapshot.status,
        suggestions: snapshot.suggestions,
      });
    }
    const waitingForRefresh =
      parsed.data.afterGeneration !== undefined &&
      (parsed.data.afterGeneration === "missing"
        ? generation === null
        : parsed.data.afterGeneration === generation);
    if (!forceRefresh && !waitingForRefresh && snapshot.status === "fresh") {
      return Response.json(
        { generation, status: "fresh", suggestions: snapshot.suggestions },
        { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
      );
    }
    if (forceRefresh || parsed.data.waitOnly !== "true" || !waitingForRefresh) {
      if (
        forceRefresh &&
        generation !== null &&
        (snapshot.status === "fresh" || snapshot.status === "stale")
      ) {
        const marked = await markArtifactSuggestionSnapshotRefreshing(
          context,
          snapshot.generatedAt,
        );
        const latestSnapshot = await readArtifactSuggestionSnapshot(context);
        const latestGeneration =
          latestSnapshot.status === "fresh" || latestSnapshot.status === "stale"
            ? latestSnapshot.generatedAt.toISOString()
            : null;
        if (!marked || latestGeneration !== generation) {
          if (latestSnapshot.status === "fresh" || latestSnapshot.status === "stale") {
            return Response.json({
              generation: latestGeneration,
              status: latestSnapshot.status,
              suggestions: latestSnapshot.suggestions,
            });
          }
          return Response.json(
            { generation: latestGeneration, status: "pending", suggestions: [] },
            { status: 202 },
          );
        }
      }
      const reservation = await reserveArtifactSuggestionRequest(context);
      await enqueueArtifactSuggestions(
        parsed.data.workspaceId,
        parsed.data.locale,
        parsed.data.target,
        `context:${contextHash}:generation:${generation ?? "missing"}:epoch:${reservation.epoch}`,
        contextHash,
        reservation.epoch,
      );
      webLogger.info(
        {
          artifactKind: parsed.data.target,
          component: "artifact-suggestions",
          event: "artifact.suggestions.queued",
          forceRefresh,
          locale: parsed.data.locale,
          snapshotState: snapshot.status,
          workspaceId: parsed.data.workspaceId,
        },
        "Artifact suggestions queued",
      );
    }
    if (!forceRefresh && !waitingForRefresh && snapshot.status === "stale") {
      return Response.json({ generation, status: "stale", suggestions: snapshot.suggestions });
    }
    return Response.json({ generation, status: "pending", suggestions: [] }, { status: 202 });
  } catch (error) {
    webLogger.error(
      {
        artifactKind: parsed.data.target,
        component: "artifact-suggestions",
        error,
        event: "artifact.suggestions.request_failed",
        forceRefresh,
        locale: parsed.data.locale,
        workspaceId: parsed.data.workspaceId,
      },
      "Artifact suggestions request failed",
    );
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return respond(
    {
      afterGeneration: query.get("afterGeneration") ?? undefined,
      locale: query.get("locale"),
      target: query.get("target"),
      waitOnly: query.get("waitOnly") ?? undefined,
      workspaceId: query.get("workspaceId"),
    },
    false,
  );
}

export async function POST(request: Request) {
  return respond(await request.json().catch(() => null), true);
}
