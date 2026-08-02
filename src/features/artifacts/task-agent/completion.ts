import { z } from "zod";

export type TaskAgentTerminalEvidence = "agent_message" | "finish_action" | "unsupported";

type TaskAgentTerminal = {
  status: string;
};

const agentMessageTerminalSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("MessageEvent"),
    source: z.literal("agent"),
  })
  .loose();
const agentActionEventSchema = z
  .object({
    action: z
      .object({
        kind: z.string().min(1),
      })
      .loose()
      .nullable(),
    id: z.string().min(1),
    kind: z.literal("ActionEvent"),
    source: z.literal("agent"),
  })
  .loose();
const eventSourceSchema = z.object({ source: z.unknown() }).loose();

type TaskAgentTerminalEvent = {
  eventId: string | null;
  evidence: TaskAgentTerminalEvidence;
};

function taskAgentTerminalEvent(newestEvents: readonly unknown[]): TaskAgentTerminalEvent {
  for (const event of newestEvents) {
    const source = eventSourceSchema.safeParse(event);
    if (!source.success || source.data.source !== "agent") continue;

    const message = agentMessageTerminalSchema.safeParse(event);
    if (message.success) {
      return { eventId: message.data.id, evidence: "agent_message" };
    }

    const action = agentActionEventSchema.safeParse(event);
    if (!action.success) return { eventId: null, evidence: "unsupported" };
    if (action.data.action?.kind === "FinishAction") {
      return { eventId: action.data.id, evidence: "finish_action" };
    }
    // Other actions are work in progress, not terminal evidence. Continue
    // scanning for the most recent MessageEvent or FinishAction.
  }
  return { eventId: null, evidence: "unsupported" };
}

export function taskAgentTerminalEvidence(
  newestEvents: readonly unknown[],
): TaskAgentTerminalEvidence {
  return taskAgentTerminalEvent(newestEvents).evidence;
}

export async function waitForVerifiedTaskAgentFinish(input: {
  continueConversation(continuationCount: number): Promise<void>;
  listNewestEvents(): Promise<readonly unknown[]>;
  maxContinuations: number;
  waitBeforeRecheck(): Promise<void>;
  waitForTerminal(): Promise<TaskAgentTerminal>;
}) {
  let continuationCount = 0;
  let continuedFromEventId: string | null = null;
  while (true) {
    const terminal = await input.waitForTerminal();
    if (terminal.status !== "finished") {
      return { continuationCount, kind: "remote_terminal" as const, status: terminal.status };
    }

    const terminalEvent = taskAgentTerminalEvent(await input.listNewestEvents());
    if (
      continuedFromEventId &&
      (terminalEvent.eventId === continuedFromEventId || terminalEvent.evidence === "unsupported")
    ) {
      await input.waitBeforeRecheck();
      continue;
    }
    continuedFromEventId = null;

    const { evidence } = terminalEvent;
    if (evidence === "finish_action") {
      return { continuationCount, evidence, kind: "verified" as const };
    }
    if (
      evidence !== "agent_message" ||
      !terminalEvent.eventId ||
      continuationCount >= input.maxContinuations
    ) {
      return { continuationCount, evidence, kind: "incomplete" as const };
    }

    continuationCount += 1;
    continuedFromEventId = terminalEvent.eventId;
    await input.continueConversation(continuationCount);
  }
}
