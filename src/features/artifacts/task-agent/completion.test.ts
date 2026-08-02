import { expect, test, vi } from "vitest";
import { taskAgentTerminalEvidence, waitForVerifiedTaskAgentFinish } from "./completion";

const stateEvent = { id: "state-1", kind: "ConversationStateUpdateEvent", source: "environment" };
const finishEvent = {
  action: { kind: "FinishAction" },
  id: "finish-1",
  kind: "ActionEvent",
  source: "agent",
};
const messageEvent = { id: "message-1", kind: "MessageEvent", source: "agent" };

test("distinguishes FinishAction from a plain agent message", () => {
  expect(taskAgentTerminalEvidence([stateEvent, finishEvent])).toBe("finish_action");
  expect(taskAgentTerminalEvidence([stateEvent, messageEvent])).toBe("agent_message");
  expect(
    taskAgentTerminalEvidence([
      stateEvent,
      {
        action: { kind: "TerminalAction" },
        id: "action-1",
        kind: "ActionEvent",
        source: "agent",
      },
    ]),
  ).toBe("unsupported");
});

test("continues the same task after a plain message and accepts a later FinishAction", async () => {
  const waitForTerminal = vi.fn(async () => ({ status: "finished" }));
  const listNewestEvents = vi
    .fn()
    .mockResolvedValueOnce([stateEvent, messageEvent])
    .mockResolvedValueOnce([stateEvent, finishEvent]);
  const continueConversation = vi.fn(async () => undefined);

  await expect(
    waitForVerifiedTaskAgentFinish({
      continueConversation,
      listNewestEvents,
      maxContinuations: 3,
      waitBeforeRecheck: vi.fn(),
      waitForTerminal,
    }),
  ).resolves.toEqual({
    continuationCount: 1,
    evidence: "finish_action",
    kind: "verified",
  });
  expect(continueConversation).toHaveBeenCalledWith(1);
  expect(waitForTerminal).toHaveBeenCalledTimes(2);
});

test("stops after three continuation messages", async () => {
  const continueConversation = vi.fn(async () => undefined);
  let messageSequence = 0;
  const result = await waitForVerifiedTaskAgentFinish({
    continueConversation,
    listNewestEvents: vi.fn(async () => {
      messageSequence += 1;
      return [{ ...messageEvent, id: `message-${messageSequence}` }];
    }),
    maxContinuations: 3,
    waitBeforeRecheck: vi.fn(),
    waitForTerminal: vi.fn(async () => ({ status: "finished" })),
  });
  expect(result).toEqual({
    continuationCount: 3,
    evidence: "agent_message",
    kind: "incomplete",
  });
  expect(continueConversation).toHaveBeenCalledTimes(3);
});

test("preserves non-finished remote terminal states", async () => {
  await expect(
    waitForVerifiedTaskAgentFinish({
      continueConversation: vi.fn(),
      listNewestEvents: vi.fn(),
      maxContinuations: 3,
      waitBeforeRecheck: vi.fn(),
      waitForTerminal: vi.fn(async () => ({ status: "error" })),
    }),
  ).resolves.toEqual({
    continuationCount: 0,
    kind: "remote_terminal",
    status: "error",
  });
});

test("does not spend another continuation while the previous terminal event is still visible", async () => {
  const continueConversation = vi.fn(async () => undefined);
  const waitBeforeRecheck = vi.fn(async () => undefined);
  const result = await waitForVerifiedTaskAgentFinish({
    continueConversation,
    listNewestEvents: vi
      .fn()
      .mockResolvedValueOnce([messageEvent])
      .mockResolvedValueOnce([messageEvent])
      .mockResolvedValueOnce([
        {
          action: { kind: "TerminalAction" },
          id: "work-2",
          kind: "ActionEvent",
          source: "agent",
        },
        messageEvent,
      ])
      .mockResolvedValueOnce([{ ...finishEvent, id: "finish-2" }]),
    maxContinuations: 3,
    waitBeforeRecheck,
    waitForTerminal: vi.fn(async () => ({ status: "finished" })),
  });

  expect(result).toEqual({
    continuationCount: 1,
    evidence: "finish_action",
    kind: "verified",
  });
  expect(continueConversation).toHaveBeenCalledTimes(1);
  expect(waitBeforeRecheck).toHaveBeenCalledTimes(2);
});
