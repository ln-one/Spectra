import type {
  KnowledgeNetworkWorkspaceNavigationContext,
  KnowledgeNetworkWorkspaceReturnView,
} from "@/features/knowledge-network/model";

export type KnowledgeNetworkPendingNavigation = {
  context: KnowledgeNetworkWorkspaceNavigationContext;
  originHref: string;
};

const pendingByTargetWorkspace = new Map<string, KnowledgeNetworkPendingNavigation>();
const returnViewByOriginWorkspace = new Map<string, KnowledgeNetworkWorkspaceReturnView>();

export function beginKnowledgeNetworkNavigation(
  targetWorkspaceId: string,
  navigation: KnowledgeNetworkPendingNavigation,
) {
  pendingByTargetWorkspace.set(targetWorkspaceId, navigation);
}

export function consumeKnowledgeNetworkNavigation(workspaceId: string) {
  const navigation = pendingByTargetWorkspace.get(workspaceId) ?? null;
  pendingByTargetWorkspace.delete(workspaceId);
  return navigation;
}

export function stageKnowledgeNetworkReturn(
  workspaceId: string,
  returnView: KnowledgeNetworkWorkspaceReturnView,
) {
  returnViewByOriginWorkspace.set(workspaceId, returnView);
}

export function consumeKnowledgeNetworkReturn(workspaceId: string) {
  const returnView = returnViewByOriginWorkspace.get(workspaceId) ?? null;
  returnViewByOriginWorkspace.delete(workspaceId);
  return returnView;
}
