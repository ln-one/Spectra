import { z } from "zod";

const aiRunStateSchema = z.enum([
  "claimed",
  "running",
  "publishing",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
  "superseded",
]);

const aiRunAttemptStateSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
]);

export type AiRunState = z.infer<typeof aiRunStateSchema>;
export type AiRunAttemptState = z.infer<typeof aiRunAttemptStateSchema>;

const aiRunTransitions = {
  claimed: [
    "claimed",
    "running",
    "publishing",
    "succeeded",
    "failed",
    "interrupted",
    "cancelled",
    "superseded",
  ],
  running: [
    "running",
    "publishing",
    "succeeded",
    "failed",
    "interrupted",
    "cancelled",
    "superseded",
  ],
  publishing: ["publishing", "succeeded", "failed", "interrupted", "cancelled", "superseded"],
  succeeded: [],
  failed: ["publishing"],
  interrupted: ["publishing"],
  cancelled: [],
  superseded: [],
} as const satisfies Record<AiRunState, readonly AiRunState[]>;

const aiRunAttemptTransitions = {
  running: ["succeeded", "failed", "interrupted", "cancelled"],
  succeeded: [],
  failed: [],
  interrupted: [],
  cancelled: [],
} as const satisfies Record<AiRunAttemptState, readonly AiRunAttemptState[]>;

export class InvalidStateTransitionError extends Error {
  readonly code = "invalid_state_transition";

  constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot transition from ${from} to ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export function transitionAiRun(from: unknown, to: AiRunState): AiRunState {
  const current = aiRunStateSchema.parse(from);
  if (!(aiRunTransitions[current] as readonly AiRunState[]).includes(to)) {
    throw new InvalidStateTransitionError("AI Run", current, to);
  }
  return to;
}

export function transitionAiRunAttempt(
  from: unknown,
  to: Exclude<AiRunAttemptState, "running">,
): AiRunAttemptState {
  const current = aiRunAttemptStateSchema.parse(from);
  if (!(aiRunAttemptTransitions[current] as readonly AiRunAttemptState[]).includes(to)) {
    throw new InvalidStateTransitionError("AI Run attempt", current, to);
  }
  return to;
}
