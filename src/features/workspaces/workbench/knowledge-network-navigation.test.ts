import { afterEach, expect, test, vi } from "vitest";
import type { KnowledgeNetworkPendingNavigation } from "./knowledge-network-navigation";
import {
  beginKnowledgeNetworkNavigation,
  consumeKnowledgeNetworkNavigation,
  consumeKnowledgeNetworkReturn,
  stageKnowledgeNetworkReturn,
} from "./knowledge-network-navigation";

function installSessionStorage() {
  const values = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
  vi.stubGlobal("window", { sessionStorage });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("persists a workspace navigation handoff until the target consumes it", () => {
  const storage = installSessionStorage();
  const navigation: KnowledgeNetworkPendingNavigation = {
    context: {
      originWorkspaceId: "workspace-origin",
      targetWorkspaceId: "workspace-target",
      sourceId: null,
      reason: "workspace-node",
      requestId: 1,
      returnView: {
        traceId: "trace-1",
        sourceMode: "network",
        selectedNodeId: "workspace-target",
        citationSourceId: null,
        requestId: 1,
      },
    },
    originHref: "/ln1/ml?conversation=conversation-1",
  };

  beginKnowledgeNetworkNavigation("workspace-target", navigation);

  expect(storage.size).toBe(1);
  expect(consumeKnowledgeNetworkNavigation("workspace-target")).toEqual(navigation);
  expect(storage.size).toBe(0);
});

test("persists and clears the return view for the origin workspace", () => {
  const storage = installSessionStorage();
  const returnView = {
    traceId: "trace-1",
    sourceMode: "network" as const,
    selectedNodeId: "source-1",
    citationSourceId: "source-1",
    requestId: 2,
  };

  stageKnowledgeNetworkReturn("workspace-origin", returnView);

  expect(storage.size).toBe(1);
  expect(consumeKnowledgeNetworkReturn("workspace-origin")).toEqual(returnView);
  expect(storage.size).toBe(0);
});
