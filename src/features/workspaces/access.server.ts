import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { workspacePermissionGrants, workspaces } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { WorkspaceError } from "./errors";
import {
  effectiveWorkspacePermissions,
  hasWorkspacePermission,
  type WorkspacePermission,
  workspacePermissions,
} from "./policy";

const permissionSet = new Set<string>(workspacePermissions);

export type WorkspaceAccessSnapshot = {
  workspaceId: string;
  permissions: readonly WorkspacePermission[];
};

export function workspaceAccessSnapshot(input: {
  id: string;
  permissions?: readonly WorkspacePermission[] | undefined;
}): WorkspaceAccessSnapshot | null {
  if (!input.permissions) return null;
  return {
    workspaceId: input.id,
    permissions: [...input.permissions],
  };
}

function parsePermission(value: string): WorkspacePermission {
  if (!permissionSet.has(value)) throw new Error(`Unsupported Workspace permission: ${value}`);
  return value as WorkspacePermission;
}

export async function resolveWorkspacePermissions(
  actor: Actor,
  workspace: {
    id: string;
    ownerId: string;
    visibility: "private" | "public";
  },
  db: Database | DatabaseTransaction = database,
) {
  if (actor.principalId === workspace.ownerId) {
    return effectiveWorkspacePermissions(actor, workspace, []);
  }
  const grants = await db
    .select({ permission: workspacePermissionGrants.permission })
    .from(workspacePermissionGrants)
    .where(
      and(
        eq(workspacePermissionGrants.workspaceId, workspace.id),
        eq(workspacePermissionGrants.principalId, actor.principalId),
      ),
    );
  return effectiveWorkspacePermissions(
    actor,
    workspace,
    grants.map((grant) => parsePermission(grant.permission)),
  );
}

export async function requireWorkspacePermission(
  actor: Actor,
  workspaceId: string,
  permission: WorkspacePermission,
  db: Database | DatabaseTransaction = database,
) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      ownerId: workspaces.ownerId,
      visibility: workspaces.visibility,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace || (workspace.visibility !== "private" && workspace.visibility !== "public")) {
    throw new WorkspaceError("workspace_not_found");
  }
  const permissions = await resolveWorkspacePermissions(
    actor,
    { ...workspace, visibility: workspace.visibility },
    db,
  );
  if (!hasWorkspacePermission(permissions, permission)) {
    throw new WorkspaceError("workspace_not_found");
  }
  return { ...workspace, permissions };
}

export async function resolveReadableWorkspaceIds(
  actor: Actor,
  workspaceIds: readonly string[],
  db: Database | DatabaseTransaction = database,
  options: { requireReferenceable?: boolean } = {},
): Promise<Set<string>> {
  const uniqueIds = [...new Set(workspaceIds)];
  if (uniqueIds.length === 0) return new Set();

  const workspaceRows = await db
    .select({
      id: workspaces.id,
      ownerId: workspaces.ownerId,
      visibility: workspaces.visibility,
      referenceable: workspaces.referenceable,
      archivedAt: workspaces.archivedAt,
    })
    .from(workspaces)
    .where(inArray(workspaces.id, uniqueIds));
  const explicitlyReadableIds = new Set(
    (
      await db
        .select({ workspaceId: workspacePermissionGrants.workspaceId })
        .from(workspacePermissionGrants)
        .where(
          and(
            inArray(workspacePermissionGrants.workspaceId, uniqueIds),
            eq(workspacePermissionGrants.principalId, actor.principalId),
            eq(workspacePermissionGrants.permission, "workspace.read"),
          ),
        )
    ).map((grant) => grant.workspaceId),
  );

  return new Set(
    workspaceRows
      .filter(
        (workspace) =>
          workspace.archivedAt === null &&
          (!options.requireReferenceable || workspace.referenceable) &&
          (workspace.ownerId === actor.principalId ||
            workspace.visibility === "public" ||
            explicitlyReadableIds.has(workspace.id)),
      )
      .map((workspace) => workspace.id),
  );
}
