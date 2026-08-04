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

const PENDING_STORAGE_PREFIX = "spectra:knowledge-network:pending:";
const RETURN_STORAGE_PREFIX = "spectra:knowledge-network:return:";

function readSessionValue<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory map remains the fallback when storage is unavailable.
  }
}

function deleteSessionValue(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function beginKnowledgeNetworkNavigation(
  targetWorkspaceId: string,
  navigation: KnowledgeNetworkPendingNavigation,
) {
  pendingByTargetWorkspace.set(targetWorkspaceId, navigation);
  writeSessionValue(`${PENDING_STORAGE_PREFIX}${targetWorkspaceId}`, navigation);
}

export function consumeKnowledgeNetworkNavigation(workspaceId: string) {
  const navigation =
    pendingByTargetWorkspace.get(workspaceId) ??
    readSessionValue<KnowledgeNetworkPendingNavigation>(`${PENDING_STORAGE_PREFIX}${workspaceId}`);
  pendingByTargetWorkspace.delete(workspaceId);
  deleteSessionValue(`${PENDING_STORAGE_PREFIX}${workspaceId}`);
  return navigation;
}

export function stageKnowledgeNetworkReturn(
  workspaceId: string,
  returnView: KnowledgeNetworkWorkspaceReturnView,
) {
  returnViewByOriginWorkspace.set(workspaceId, returnView);
  writeSessionValue(`${RETURN_STORAGE_PREFIX}${workspaceId}`, returnView);
}

export function consumeKnowledgeNetworkReturn(workspaceId: string) {
  const returnView =
    returnViewByOriginWorkspace.get(workspaceId) ??
    readSessionValue<KnowledgeNetworkWorkspaceReturnView>(`${RETURN_STORAGE_PREFIX}${workspaceId}`);
  returnViewByOriginWorkspace.delete(workspaceId);
  deleteSessionValue(`${RETURN_STORAGE_PREFIX}${workspaceId}`);
  return returnView;
}
