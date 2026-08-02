export type TaskAgentWaitBudget = {
  pollIntervalMs: number;
};

export type TaskAgentRemoteInspection = {
  found: boolean;
  status: string | null;
};

export async function waitForTaskAgentTerminal(input: {
  budget: TaskAgentWaitBudget;
  inspect: () => Promise<TaskAgentRemoteInspection>;
  remainingPolls: number;
  sleep: (milliseconds: number) => Promise<void>;
}) {
  for (let poll = 0; poll < input.remainingPolls; poll += 1) {
    const remote = await input.inspect();
    if (!remote.found || remote.status === "deleting") {
      return { polls: poll + 1, status: "missing" as const };
    }

    switch (remote.status) {
      case "finished":
        return { polls: poll + 1, status: "finished" as const };
      case "stuck":
      case "error":
      case "paused":
      case "waiting_for_confirmation":
        return { polls: poll + 1, status: remote.status };
      case "idle":
      case "running":
        await input.sleep(input.budget.pollIntervalMs);
        break;
      default:
        return { polls: poll + 1, status: "unsupported_state" as const };
    }
  }

  return {
    polls: input.remainingPolls,
    status: "budget_exhausted" as const,
  };
}
