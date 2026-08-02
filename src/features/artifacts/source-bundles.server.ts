import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { artifactSourceBundles } from "@/database/schema";

const sourceBundleIdentitySchema = z
  .object({
    artifactId: z.string().uuid(),
    generationAttemptId: z.string().uuid().nullable().optional(),
    manifest: z.unknown(),
    mediaType: z.literal("application/gzip"),
    objectKey: z.string().trim().min(1).max(512),
    objectVersionId: z.string().trim().min(1).max(255),
    producingRunId: z.string().uuid().nullable().optional(),
    recipeVersion: z.string().trim().min(1).max(100),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().positive(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Boolean(input.generationAttemptId) === Boolean(input.producingRunId)) {
      context.addIssue({
        code: "custom",
        message: "A source bundle must have exactly one producer",
        path: ["generationAttemptId"],
      });
    }
  });

export type StagedArtifactSourceBundle = z.infer<typeof sourceBundleIdentitySchema>;

function bundleMatches(
  existing: typeof artifactSourceBundles.$inferSelect,
  input: StagedArtifactSourceBundle,
) {
  return (
    existing.artifactId === input.artifactId &&
    existing.objectKey === input.objectKey &&
    existing.objectVersionId === input.objectVersionId &&
    existing.mediaType === input.mediaType &&
    existing.recipeVersion === input.recipeVersion &&
    existing.sha256 === input.sha256 &&
    existing.sizeBytes === input.sizeBytes &&
    canonicalJsonSha256(existing.manifest) === canonicalJsonSha256(input.manifest)
  );
}

export async function stageArtifactSourceBundle(
  input: StagedArtifactSourceBundle,
  db: Database = database,
) {
  const parsed = sourceBundleIdentitySchema.parse(input);
  if (!parsed.generationAttemptId && !parsed.producingRunId) {
    throw new Error("artifact_source_bundle_producer_missing");
  }
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(artifactSourceBundles)
      .where(
        parsed.generationAttemptId
          ? eq(artifactSourceBundles.generationAttemptId, parsed.generationAttemptId)
          : eq(
              artifactSourceBundles.producingRunId,
              z.string().uuid().parse(parsed.producingRunId),
            ),
      )
      .limit(1)
      .for("update");
    if (existing) {
      if (!bundleMatches(existing, parsed)) throw new Error("artifact_source_bundle_conflict");
      return existing;
    }
    const [created] = await tx
      .insert(artifactSourceBundles)
      .values({
        artifactId: parsed.artifactId,
        bundleFormat: "tar_gzip",
        generationAttemptId: parsed.generationAttemptId ?? null,
        manifest: parsed.manifest,
        mediaType: parsed.mediaType,
        objectKey: parsed.objectKey,
        objectVersionId: parsed.objectVersionId,
        producingRunId: parsed.producingRunId ?? null,
        recipeVersion: parsed.recipeVersion,
        sha256: parsed.sha256,
        sizeBytes: parsed.sizeBytes,
        state: "staged",
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // A concurrent transaction may have won the producer unique index after
    // the initial read. Re-read its committed row and apply the same
    // idempotency check instead of surfacing a raw unique violation.
    const [raced] = await tx
      .select()
      .from(artifactSourceBundles)
      .where(
        parsed.generationAttemptId
          ? eq(artifactSourceBundles.generationAttemptId, parsed.generationAttemptId)
          : eq(
              artifactSourceBundles.producingRunId,
              z.string().uuid().parse(parsed.producingRunId),
            ),
      )
      .limit(1)
      .for("update");
    if (!raced) throw new Error("artifact_source_bundle_not_staged");
    if (!bundleMatches(raced, parsed)) throw new Error("artifact_source_bundle_conflict");
    return raced;
  });
}

export async function publishArtifactSourceBundle(
  transaction: DatabaseTransaction,
  input: {
    artifactId: string;
    generationAttemptId?: string;
    producingRunId?: string;
    revisionId: string;
  },
) {
  const parsed = z
    .object({
      artifactId: z.string().uuid(),
      generationAttemptId: z.string().uuid().optional(),
      producingRunId: z.string().uuid().optional(),
      revisionId: z.string().uuid(),
    })
    .refine((value) => Boolean(value.generationAttemptId) !== Boolean(value.producingRunId))
    .strict()
    .parse(input);
  if (!parsed.generationAttemptId && !parsed.producingRunId) {
    throw new Error("artifact_source_bundle_producer_missing");
  }
  const [bundle] = await transaction
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.artifactId, parsed.artifactId),
        parsed.generationAttemptId
          ? eq(artifactSourceBundles.generationAttemptId, parsed.generationAttemptId)
          : eq(
              artifactSourceBundles.producingRunId,
              z.string().uuid().parse(parsed.producingRunId),
            ),
      ),
    )
    .limit(1)
    .for("update");
  if (!bundle) throw new Error("artifact_source_bundle_missing");
  if (bundle.state === "published") {
    if (bundle.artifactRevisionId !== parsed.revisionId) {
      throw new Error("artifact_source_bundle_revision_conflict");
    }
    return bundle;
  }
  const [published] = await transaction
    .update(artifactSourceBundles)
    .set({
      artifactRevisionId: parsed.revisionId,
      state: "published",
      updatedAt: new Date(),
    })
    .where(and(eq(artifactSourceBundles.id, bundle.id), eq(artifactSourceBundles.state, "staged")))
    .returning();
  if (!published) throw new Error("artifact_source_bundle_publication_conflict");
  return published;
}

export async function discardStagedArtifactSourceBundle(
  producerId: string,
  db: Database = database,
) {
  const parsed = z.string().uuid().parse(producerId);
  await db
    .delete(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.generationAttemptId, parsed),
        eq(artifactSourceBundles.state, "staged"),
      ),
    );
}

export async function publishArtifactSourceBundleById(
  transaction: DatabaseTransaction,
  input: { artifactId: string; bundleId: string; revisionId: string },
) {
  const parsed = z
    .object({
      artifactId: z.string().uuid(),
      bundleId: z.string().uuid(),
      revisionId: z.string().uuid(),
    })
    .strict()
    .parse(input);
  const [bundle] = await transaction
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.id, parsed.bundleId),
        eq(artifactSourceBundles.artifactId, parsed.artifactId),
      ),
    )
    .limit(1)
    .for("update");
  if (!bundle) throw new Error("artifact_source_bundle_missing");
  if (bundle.state === "published") {
    if (bundle.artifactRevisionId !== parsed.revisionId) {
      throw new Error("artifact_source_bundle_revision_conflict");
    }
    return bundle;
  }
  if (bundle.artifactRevisionId || bundle.producingRunId === null) {
    throw new Error("artifact_source_bundle_publication_conflict");
  }
  const [published] = await transaction
    .update(artifactSourceBundles)
    .set({ artifactRevisionId: parsed.revisionId, state: "published", updatedAt: new Date() })
    .where(and(eq(artifactSourceBundles.id, bundle.id), eq(artifactSourceBundles.state, "staged")))
    .returning();
  if (!published) throw new Error("artifact_source_bundle_publication_conflict");
  return published;
}
