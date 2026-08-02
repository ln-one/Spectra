import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { artifactGenerationAttempts, artifactProviderAttempts } from "@/database/schema";
import { transitionArtifactProviderAttempt } from "./attempt-state";

const idSchema = z.string().uuid();

export async function startArtifactProviderAttempt(
  input: {
    generationAttemptId: string;
    model: string;
    provider: string;
  },
  db: Database = database,
) {
  const parsed = z
    .object({
      generationAttemptId: idSchema,
      model: z.string().trim().min(1).max(128),
      provider: z.string().trim().min(1).max(64),
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const [generationAttempt] = await tx
      .select({ id: artifactGenerationAttempts.id, state: artifactGenerationAttempts.state })
      .from(artifactGenerationAttempts)
      .where(eq(artifactGenerationAttempts.id, parsed.generationAttemptId))
      .limit(1)
      .for("update");
    if (generationAttempt?.state !== "running") return null;
    const [latest] = await tx
      .select({ ordinal: artifactProviderAttempts.ordinal })
      .from(artifactProviderAttempts)
      .where(eq(artifactProviderAttempts.generationAttemptId, generationAttempt.id))
      .orderBy(desc(artifactProviderAttempts.ordinal))
      .limit(1);
    const [attempt] = await tx
      .insert(artifactProviderAttempts)
      .values({
        generationAttemptId: generationAttempt.id,
        ordinal: (latest?.ordinal ?? 0) + 1,
        requestedModel: parsed.model,
        requestedProvider: parsed.provider,
      })
      .returning();
    if (!attempt) throw new Error("Artifact provider attempt was not created");
    return attempt;
  });
}

export async function settleArtifactProviderAttempt(
  input: {
    attemptId: string;
    effectiveModel?: string | null;
    effectiveProvider?: string | null;
    errorCode?: string | null;
    providerCallCount?: number;
    state: "succeeded" | "failed" | "exhausted";
    toolCallCount?: number;
  },
  db: Database = database,
) {
  const parsed = z
    .object({
      attemptId: idSchema,
      effectiveModel: z.string().trim().min(1).max(128).nullable().optional(),
      effectiveProvider: z.string().trim().min(1).max(64).nullable().optional(),
      errorCode: z.string().trim().min(1).max(100).nullable().optional(),
      providerCallCount: z.number().int().nonnegative().optional(),
      state: z.enum(["succeeded", "failed", "exhausted"]),
      toolCallCount: z.number().int().nonnegative().optional(),
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(artifactProviderAttempts)
      .where(eq(artifactProviderAttempts.id, parsed.attemptId))
      .limit(1)
      .for("update");
    if (attempt?.state !== "running") return null;
    const state = transitionArtifactProviderAttempt(attempt.state, parsed.state);
    const [updated] = await tx
      .update(artifactProviderAttempts)
      .set({
        effectiveModel: parsed.effectiveModel ?? null,
        effectiveProvider: parsed.effectiveProvider ?? null,
        errorCode: parsed.errorCode ?? null,
        finishedAt: new Date(),
        providerCallCount: parsed.providerCallCount ?? 1,
        state,
        toolCallCount: parsed.toolCallCount ?? 0,
      })
      .where(
        and(
          eq(artifactProviderAttempts.id, attempt.id),
          eq(artifactProviderAttempts.state, attempt.state),
        ),
      )
      .returning();
    return updated ?? null;
  });
}
