import type { Actor } from "@/features/identity/types";

export const workspacePermissions = [
  "workspace.read",
  "workspace.chat",
  "artifact.private.create",
  "artifact.private.manage",
  "artifact.publishToSources",
  "source.manage",
  "workspace.manageSharing",
  "workspace.manageSettings",
] as const;

export type WorkspacePermission = (typeof workspacePermissions)[number];

export const sharedWorkspacePermissions = [
  "workspace.read",
  "workspace.chat",
  "artifact.private.create",
  "artifact.private.manage",
] as const satisfies readonly WorkspacePermission[];

export function effectiveWorkspacePermissions(
  actor: Actor,
  workspace: { ownerId: string; visibility: "private" | "public" },
  explicitlyGranted: readonly WorkspacePermission[],
): WorkspacePermission[] {
  if (actor.principalId === workspace.ownerId) return [...workspacePermissions];
  const permissions = new Set<WorkspacePermission>(explicitlyGranted);
  if (workspace.visibility === "public") {
    for (const permission of sharedWorkspacePermissions) permissions.add(permission);
  }
  return workspacePermissions.filter((permission) => permissions.has(permission));
}

export function hasWorkspacePermission(
  permissions: readonly WorkspacePermission[],
  permission: WorkspacePermission,
) {
  return permissions.includes(permission);
}

export function canReadWorkspace(actor: Actor, ownerId: string) {
  return actor.principalId === ownerId;
}
