import "server-only";

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "@/database/client";
import { aiRunAttempts, aiRuns } from "@/database/schema";
import { finishAiRun, settleAiRunAttempt } from "./runs";

export async function convergeStaleAiRuns(db: Database, now = new Date()) {
  const staleRuns = await db
    .select()
    .from(aiRuns)
    .where(
      and(inArray(aiRuns.state, ["claimed", "running", "publishing"]), lte(aiRuns.deadlineAt, now)),
    )
    .orderBy(asc(aiRuns.deadlineAt))
    .limit(100);
  for (const run of staleRuns) {
    const attempts = await db
      .select({ id: aiRunAttempts.id })
      .from(aiRunAttempts)
      .where(and(eq(aiRunAttempts.runId, run.id), eq(aiRunAttempts.state, "running")));
    for (const attempt of attempts) {
      await settleAiRunAttempt(
        { attemptId: attempt.id, errorCode: "agent_timeout", state: "interrupted" },
        db,
      );
    }
    await finishAiRun(
      {
        abortReason: "timeout",
        failureCode: "agent_timeout",
        runId: run.id,
        state: "interrupted",
      },
      db,
    );
  }
  return staleRuns.length;
}
