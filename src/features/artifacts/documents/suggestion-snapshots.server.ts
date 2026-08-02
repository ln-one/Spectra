import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import { type Database, database } from "@/database/client";
import { artifactSuggestionRequests, artifactSuggestionSnapshots } from "@/database/schema";
import { artifactSuggestionSchema } from "@/features/artifacts/suggestions/contract";
import type { ArtifactSuggestionContext } from "./suggestions";

const FRESH_MS = 30 * 60 * 1_000;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000;
const suggestionsSchema = z.array(artifactSuggestionSchema).length(4);

export function artifactSuggestionContextHash(context: ArtifactSuggestionContext) {
  return canonicalJsonSha256(context);
}

export async function readArtifactSuggestionSnapshot(
  context: ArtifactSuggestionContext,
  now = new Date(),
  db: Database = database,
) {
  const [snapshot] = await db
    .select()
    .from(artifactSuggestionSnapshots)
    .where(
      and(
        eq(artifactSuggestionSnapshots.workspaceId, context.workspaceId),
        eq(artifactSuggestionSnapshots.locale, context.locale),
        eq(artifactSuggestionSnapshots.artifactKind, context.target),
      ),
    )
    .limit(1);
  if (!snapshot || snapshot.expiresAt <= now) return { status: "missing" as const };
  const suggestions = suggestionsSchema.parse(snapshot.suggestions);
  if (snapshot.contextHash !== artifactSuggestionContextHash(context)) {
    return { status: "changed" as const };
  }
  return {
    generatedAt: snapshot.generatedAt,
    status:
      snapshot.updatedAt <= snapshot.generatedAt &&
      now.getTime() - snapshot.generatedAt.getTime() < FRESH_MS
        ? ("fresh" as const)
        : ("stale" as const),
    suggestions,
  };
}

export async function markArtifactSuggestionSnapshotRefreshing(
  context: ArtifactSuggestionContext,
  expectedGeneratedAt: Date,
  now = new Date(),
  db: Database = database,
) {
  const refreshed = await db
    .update(artifactSuggestionSnapshots)
    .set({ updatedAt: now })
    .where(
      and(
        eq(artifactSuggestionSnapshots.workspaceId, context.workspaceId),
        eq(artifactSuggestionSnapshots.locale, context.locale),
        eq(artifactSuggestionSnapshots.artifactKind, context.target),
        eq(artifactSuggestionSnapshots.generatedAt, expectedGeneratedAt),
      ),
    )
    .returning({ generatedAt: artifactSuggestionSnapshots.generatedAt });
  return refreshed.length === 1;
}

export async function writeArtifactSuggestionSnapshot(
  context: ArtifactSuggestionContext,
  suggestions: z.infer<typeof suggestionsSchema>,
  now = new Date(),
  db: Database = database,
) {
  const value = {
    artifactKind: context.target,
    contextHash: artifactSuggestionContextHash(context),
    expiresAt: new Date(now.getTime() + EXPIRY_MS),
    generatedAt: now,
    locale: context.locale,
    suggestions: suggestionsSchema.parse(suggestions),
    updatedAt: now,
    workspaceId: context.workspaceId,
  };
  await db
    .insert(artifactSuggestionSnapshots)
    .values(value)
    .onConflictDoUpdate({
      set: value,
      target: [
        artifactSuggestionSnapshots.workspaceId,
        artifactSuggestionSnapshots.locale,
        artifactSuggestionSnapshots.artifactKind,
      ],
    });
}

export async function reserveArtifactSuggestionRequest(
  context: ArtifactSuggestionContext,
  db: Database = database,
) {
  const [reservation] = await db
    .insert(artifactSuggestionRequests)
    .values({
      artifactKind: context.target,
      contextHash: artifactSuggestionContextHash(context),
      epoch: 1,
      locale: context.locale,
      workspaceId: context.workspaceId,
    })
    .onConflictDoUpdate({
      set: {
        contextHash: artifactSuggestionContextHash(context),
        epoch: sql`${artifactSuggestionRequests.epoch} + 1`,
        requestedAt: sql`clock_timestamp()`,
      },
      target: [
        artifactSuggestionRequests.workspaceId,
        artifactSuggestionRequests.locale,
        artifactSuggestionRequests.artifactKind,
      ],
    })
    .returning({
      epoch: artifactSuggestionRequests.epoch,
      requestedAt: artifactSuggestionRequests.requestedAt,
    });
  if (!reservation) throw new Error("Artifact suggestion request reservation failed.");
  return reservation;
}

export async function writeArtifactSuggestionSnapshotIfCurrentRequest(
  context: ArtifactSuggestionContext,
  suggestions: z.infer<typeof suggestionsSchema>,
  requestEpoch: number,
  generatedAt = new Date(),
  db: Database = database,
) {
  const [reservation] = await db
    .select({ epoch: artifactSuggestionRequests.epoch })
    .from(artifactSuggestionRequests)
    .where(
      and(
        eq(artifactSuggestionRequests.workspaceId, context.workspaceId),
        eq(artifactSuggestionRequests.locale, context.locale),
        eq(artifactSuggestionRequests.artifactKind, context.target),
        eq(artifactSuggestionRequests.contextHash, artifactSuggestionContextHash(context)),
        eq(artifactSuggestionRequests.epoch, requestEpoch),
      ),
    )
    .for("update")
    .limit(1);
  if (!reservation) return false;
  await writeArtifactSuggestionSnapshot(context, suggestions, generatedAt, db);
  return true;
}
