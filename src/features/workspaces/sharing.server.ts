import "server-only";

import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  principals,
  workspaceLocators,
  workspacePermissionGrants,
  workspaces,
} from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission, type WorkspaceAccessSnapshot } from "./access.server";
import { WorkspaceError } from "./errors";
import {
  hasWorkspacePermission,
  sharedWorkspacePermissions,
  type WorkspacePermission,
} from "./policy";

const identityLookupSchema = z.string().trim().min(1).max(320);
const identitySearchSchema = z.string().trim().min(2).max(100);
const workspaceIdSchema = z.string().uuid();
const visibilitySchema = z.enum(["private", "public"]);

type WorkspaceSharingMember = {
  principalId: string;
  handle: string;
  email: string | null;
  permissions: WorkspacePermission[];
};

export type WorkspaceInviteCandidate = {
  principalId: string;
  handle: string;
  email: string | null;
};

export type WorkspaceSharingState = {
  canManage: boolean;
  firstSharedAt: string | null;
  members: WorkspaceSharingMember[];
  referenceable: boolean;
  slug: string | null;
  visibility: "private" | "public";
};

function parseVisibility(value: string): "private" | "public" {
  return visibilitySchema.parse(value);
}

async function sharingWorkspace(
  actor: Actor,
  workspaceId: string,
  db: Database,
  accessSnapshot?: WorkspaceAccessSnapshot,
) {
  const access =
    accessSnapshot?.workspaceId === workspaceId
      ? accessSnapshot
      : await requireWorkspacePermission(actor, workspaceId, "workspace.read", db);
  if (!hasWorkspacePermission(access.permissions, "workspace.read")) {
    throw new WorkspaceError("workspace_not_found");
  }
  const [workspace] = await db
    .select({
      id: workspaces.id,
      ownerId: workspaces.ownerId,
      visibility: workspaces.visibility,
      referenceable: workspaces.referenceable,
      firstSharedAt: workspaces.firstSharedAt,
      slug: workspaceLocators.slug,
    })
    .from(workspaces)
    .leftJoin(
      workspaceLocators,
      and(
        eq(workspaceLocators.workspaceId, workspaces.id),
        eq(workspaceLocators.state, "current"),
        isNull(workspaceLocators.replacedAt),
      ),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new WorkspaceError("workspace_not_found");
  return {
    ...workspace,
    visibility: parseVisibility(workspace.visibility),
    permissions: access.permissions,
  };
}

export async function getWorkspaceSharingState(
  actor: Actor,
  rawWorkspaceId: string,
  db: Database = database,
  accessSnapshot?: WorkspaceAccessSnapshot,
): Promise<WorkspaceSharingState> {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const workspace = await sharingWorkspace(actor, workspaceId, db, accessSnapshot);
  const canManage = hasWorkspacePermission(workspace.permissions, "workspace.manageSharing");
  if (!canManage) {
    return {
      canManage: false,
      firstSharedAt: workspace.firstSharedAt?.toISOString() ?? null,
      members: [],
      referenceable: workspace.referenceable,
      slug: workspace.slug,
      visibility: workspace.visibility,
    };
  }
  const rows = await db
    .select({
      principalId: principals.id,
      handle: principals.handle,
      email: principals.email,
      permission: workspacePermissionGrants.permission,
    })
    .from(workspacePermissionGrants)
    .innerJoin(principals, eq(workspacePermissionGrants.principalId, principals.id))
    .where(eq(workspacePermissionGrants.workspaceId, workspaceId))
    .orderBy(asc(principals.handle), asc(workspacePermissionGrants.permission));
  const members = new Map<string, WorkspaceSharingMember>();
  for (const row of rows) {
    const member = members.get(row.principalId) ?? {
      principalId: row.principalId,
      handle: row.handle,
      email: row.email,
      permissions: [],
    };
    if (sharedWorkspacePermissions.includes(row.permission as never)) {
      member.permissions.push(row.permission as WorkspacePermission);
    }
    members.set(row.principalId, member);
  }
  return {
    canManage,
    firstSharedAt: workspace.firstSharedAt?.toISOString() ?? null,
    members: [...members.values()],
    referenceable: workspace.referenceable,
    slug: workspace.slug,
    visibility: workspace.visibility,
  };
}

async function markWorkspaceShared(workspaceId: string, db: Database | DatabaseTransaction) {
  await db
    .update(workspaces)
    .set({
      firstSharedAt: sql`coalesce(${workspaces.firstSharedAt}, CURRENT_TIMESTAMP)`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(workspaces.id, workspaceId));
}

export async function grantWorkspaceAccess(
  actor: Actor,
  rawWorkspaceId: string,
  rawIdentity: string,
  db: Database = database,
) {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const identity = identityLookupSchema.parse(rawIdentity).toLowerCase();
  await requireWorkspacePermission(actor, workspaceId, "workspace.manageSharing", db);
  const [locator] = await db
    .select({ id: workspaceLocators.id })
    .from(workspaceLocators)
    .where(
      and(eq(workspaceLocators.workspaceId, workspaceId), eq(workspaceLocators.state, "current")),
    )
    .limit(1);
  if (!locator) throw new WorkspaceError("workspace_slug_required");
  const [principal] = await db
    .select({ id: principals.id })
    .from(principals)
    .where(
      and(
        eq(principals.status, "active"),
        isNull(principals.deletedAt),
        or(eq(principals.handle, identity), eq(principals.email, identity)),
      ),
    )
    .limit(1);
  if (!principal || principal.id === actor.principalId) {
    throw new WorkspaceError("workspace_invitee_not_found");
  }
  await db.transaction(async (transaction) => {
    await transaction
      .insert(workspacePermissionGrants)
      .values(
        sharedWorkspacePermissions.map((permission) => ({
          workspaceId,
          principalId: principal.id,
          permission,
          grantedByPrincipalId: actor.principalId,
        })),
      )
      .onConflictDoNothing();
    await markWorkspaceShared(workspaceId, transaction);
  });
  return getWorkspaceSharingState(actor, workspaceId, db);
}

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchWorkspaceInviteCandidates(
  actor: Actor,
  rawWorkspaceId: string,
  rawQuery: string,
  db: Database = database,
): Promise<WorkspaceInviteCandidate[]> {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const query = identitySearchSchema.parse(rawQuery).toLowerCase();
  await requireWorkspacePermission(actor, workspaceId, "workspace.manageSharing", db);
  const prefix = `${escapeLikePattern(query)}%`;
  return db
    .select({
      principalId: principals.id,
      handle: principals.handle,
      email: principals.email,
    })
    .from(principals)
    .leftJoin(
      workspacePermissionGrants,
      and(
        eq(workspacePermissionGrants.workspaceId, workspaceId),
        eq(workspacePermissionGrants.principalId, principals.id),
      ),
    )
    .where(
      and(
        eq(principals.status, "active"),
        isNull(principals.deletedAt),
        ne(principals.id, actor.principalId),
        isNull(workspacePermissionGrants.id),
        or(ilike(principals.handle, prefix), ilike(principals.email, prefix)),
      ),
    )
    .orderBy(asc(principals.handle))
    .limit(8);
}

export async function revokeWorkspaceAccess(
  actor: Actor,
  rawWorkspaceId: string,
  rawPrincipalId: string,
  db: Database = database,
) {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const principalId = z.string().uuid().parse(rawPrincipalId);
  await requireWorkspacePermission(actor, workspaceId, "workspace.manageSharing", db);
  await db
    .delete(workspacePermissionGrants)
    .where(
      and(
        eq(workspacePermissionGrants.workspaceId, workspaceId),
        eq(workspacePermissionGrants.principalId, principalId),
        inArray(workspacePermissionGrants.permission, [...sharedWorkspacePermissions]),
      ),
    );
  return getWorkspaceSharingState(actor, workspaceId, db);
}

export async function setWorkspaceVisibility(
  actor: Actor,
  rawWorkspaceId: string,
  rawVisibility: string,
  db: Database = database,
) {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const visibility = visibilitySchema.parse(rawVisibility);
  await requireWorkspacePermission(actor, workspaceId, "workspace.manageSharing", db);
  const [locator] = await db
    .select({ id: workspaceLocators.id })
    .from(workspaceLocators)
    .where(
      and(eq(workspaceLocators.workspaceId, workspaceId), eq(workspaceLocators.state, "current")),
    )
    .limit(1);
  if (!locator) throw new WorkspaceError("workspace_slug_required");
  await db
    .update(workspaces)
    .set({
      visibility,
      firstSharedAt: sql`coalesce(${workspaces.firstSharedAt}, CURRENT_TIMESTAMP)`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(workspaces.id, workspaceId));
  return getWorkspaceSharingState(actor, workspaceId, db);
}

export async function setWorkspaceReferenceability(
  actor: Actor,
  rawWorkspaceId: string,
  rawReferenceable: boolean,
  db: Database = database,
) {
  const workspaceId = workspaceIdSchema.parse(rawWorkspaceId);
  const referenceable = z.boolean().parse(rawReferenceable);
  await requireWorkspacePermission(actor, workspaceId, "workspace.manageSharing", db);
  if (referenceable) {
    const [locator] = await db
      .select({ id: workspaceLocators.id })
      .from(workspaceLocators)
      .where(
        and(eq(workspaceLocators.workspaceId, workspaceId), eq(workspaceLocators.state, "current")),
      )
      .limit(1);
    if (!locator) throw new WorkspaceError("workspace_slug_required");
  }
  await db
    .update(workspaces)
    .set({
      referenceable,
      ...(referenceable
        ? { firstSharedAt: sql`coalesce(${workspaces.firstSharedAt}, CURRENT_TIMESTAMP)` }
        : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(workspaces.id, workspaceId));
  return getWorkspaceSharingState(actor, workspaceId, db);
}
