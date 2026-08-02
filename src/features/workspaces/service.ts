import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import {
  principals,
  workspaceLocators,
  workspacePermissionGrants,
  workspaces,
} from "@/database/schema";
import { handleSchema } from "@/features/identity/handle";
import type { Actor } from "@/features/identity/types";
import { resolveWorkspacePermissions } from "./access.server";
import { WorkspaceError } from "./errors";
import { workspacePermissions } from "./policy";
import type { Workspace } from "./types";
import {
  type CreateWorkspaceInput,
  createWorkspaceSchema,
  type UpdateWorkspaceInput,
  updateWorkspaceSchema,
  workspaceNameSchema,
  workspaceSlugSchema,
} from "./validation";

const currentLocator = and(
  eq(workspaceLocators.state, "current"),
  isNull(workspaceLocators.replacedAt),
);

const workspaceSelection = {
  id: workspaces.id,
  ownerId: workspaces.ownerId,
  ownerHandle: principals.handle,
  slug: workspaceLocators.slug,
  name: workspaces.name,
  visibility: workspaces.visibility,
  firstSharedAt: workspaces.firstSharedAt,
  archivedAt: workspaces.archivedAt,
  createdAt: workspaces.createdAt,
  updatedAt: workspaces.updatedAt,
};

type WorkspaceRow = {
  id: string;
  ownerId: string;
  ownerHandle: string;
  slug: string | null;
  name: string;
  visibility: string;
  firstSharedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseVisibility(value: string): "private" | "public" {
  if (value !== "private" && value !== "public") {
    throw new Error(`Unsupported workspace visibility: ${value}`);
  }
  return value;
}

function toWorkspace(
  row: WorkspaceRow,
  permissions: NonNullable<Workspace["permissions"]>,
  resolvedFromRedirect = false,
): Workspace {
  return {
    ...row,
    visibility: parseVisibility(row.visibility),
    firstSharedAt: row.firstSharedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    permissions,
    resolvedFromRedirect,
  };
}

function isUniqueViolation(error: unknown) {
  let current = error;
  const visited = new Set<unknown>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

async function selectWorkspaceRow(id: string, db: Database) {
  const [row] = await db
    .select(workspaceSelection)
    .from(workspaces)
    .innerJoin(principals, eq(workspaces.ownerId, principals.id))
    .leftJoin(
      workspaceLocators,
      and(eq(workspaceLocators.workspaceId, workspaces.id), currentLocator),
    )
    .where(eq(workspaces.id, id))
    .limit(1);
  return row;
}

export async function createWorkspace(
  actor: Actor,
  input: CreateWorkspaceInput,
  db: Database = database,
): Promise<Workspace> {
  const payload = createWorkspaceSchema.parse(input);
  try {
    const created = await db.transaction(async (transaction) => {
      const [workspace] = await transaction
        .insert(workspaces)
        .values({ ownerId: actor.principalId, name: payload.name })
        .returning();
      if (!workspace) throw new Error("Workspace insert returned no row");
      if (payload.slug) {
        await transaction.insert(workspaceLocators).values({
          workspaceId: workspace.id,
          ownerId: workspace.ownerId,
          slug: payload.slug,
        });
      }
      return workspace;
    });
    return toWorkspace({ ...created, ownerHandle: actor.handle, slug: payload.slug ?? null }, [
      ...workspacePermissions,
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new WorkspaceError("workspace_slug_conflict");
    throw error;
  }
}

export async function listWorkspaces(actor: Actor, db: Database = database): Promise<Workspace[]> {
  const rows = await db
    .select(workspaceSelection)
    .from(workspaces)
    .innerJoin(principals, eq(workspaces.ownerId, principals.id))
    .leftJoin(
      workspaceLocators,
      and(eq(workspaceLocators.workspaceId, workspaces.id), currentLocator),
    )
    .where(eq(workspaces.ownerId, actor.principalId))
    .orderBy(desc(workspaces.updatedAt), desc(workspaces.id));
  return rows.map((row) => toWorkspace(row, [...workspacePermissions]));
}

export async function listSharedWorkspaces(
  actor: Actor,
  db: Database = database,
): Promise<Workspace[]> {
  const rows = await db
    .select(workspaceSelection)
    .from(workspacePermissionGrants)
    .innerJoin(workspaces, eq(workspacePermissionGrants.workspaceId, workspaces.id))
    .innerJoin(principals, eq(workspaces.ownerId, principals.id))
    .leftJoin(
      workspaceLocators,
      and(eq(workspaceLocators.workspaceId, workspaces.id), currentLocator),
    )
    .where(
      and(
        eq(workspacePermissionGrants.principalId, actor.principalId),
        eq(workspacePermissionGrants.permission, "workspace.read"),
      ),
    )
    .orderBy(desc(workspaces.updatedAt), desc(workspaces.id));
  return Promise.all(
    rows.map(async (row) =>
      toWorkspace(
        row,
        await resolveWorkspacePermissions(
          actor,
          { id: row.id, ownerId: row.ownerId, visibility: parseVisibility(row.visibility) },
          db,
        ),
      ),
    ),
  );
}

export async function renameWorkspace(
  actor: Actor,
  id: string,
  name: string,
  db: Database = database,
): Promise<Workspace> {
  if (!z.string().uuid().safeParse(id).success) throw new WorkspaceError("workspace_not_found");
  const normalizedName = workspaceNameSchema.parse(name);
  const [updated] = await db
    .update(workspaces)
    .set({ name: normalizedName, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, actor.principalId)))
    .returning();
  if (!updated) throw new WorkspaceError("workspace_not_found");
  const row = await selectWorkspaceRow(updated.id, db);
  if (!row) throw new WorkspaceError("workspace_not_found");
  return toWorkspace(row, [...workspacePermissions]);
}

export async function setWorkspaceArchiveState(
  actor: Actor,
  id: string,
  state: "active" | "archived",
  db: Database = database,
): Promise<Workspace> {
  if (!z.string().uuid().safeParse(id).success) throw new WorkspaceError("workspace_not_found");
  const normalizedState = z.enum(["active", "archived"]).parse(state);
  const [updated] = await db
    .update(workspaces)
    .set({
      archivedAt: normalizedState === "archived" ? sql`CURRENT_TIMESTAMP` : null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, actor.principalId)))
    .returning();
  if (!updated) throw new WorkspaceError("workspace_not_found");
  const row = await selectWorkspaceRow(updated.id, db);
  if (!row) throw new WorkspaceError("workspace_not_found");
  return toWorkspace(row, [...workspacePermissions]);
}

export async function updateWorkspace(
  actor: Actor,
  id: string,
  input: UpdateWorkspaceInput,
  db: Database = database,
): Promise<Workspace> {
  if (!z.string().uuid().safeParse(id).success) throw new WorkspaceError("workspace_not_found");
  const payload = updateWorkspaceSchema.parse(input);
  try {
    await db.transaction(async (transaction) => {
      const [workspace] = await transaction
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, actor.principalId)))
        .for("update")
        .limit(1);
      if (!workspace) throw new WorkspaceError("workspace_not_found");
      if (workspace.firstSharedAt && !payload.slug) {
        throw new WorkspaceError("workspace_slug_required");
      }
      const [locator] = await transaction
        .select()
        .from(workspaceLocators)
        .where(and(eq(workspaceLocators.workspaceId, id), currentLocator))
        .for("update")
        .limit(1);
      if ((locator?.slug ?? null) !== payload.slug) {
        if (locator && workspace.firstSharedAt) {
          await transaction
            .update(workspaceLocators)
            .set({ state: "redirect", replacedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(workspaceLocators.id, locator.id));
        } else if (locator) {
          await transaction.delete(workspaceLocators).where(eq(workspaceLocators.id, locator.id));
        }
        if (payload.slug) {
          await transaction.insert(workspaceLocators).values({
            workspaceId: id,
            ownerId: workspace.ownerId,
            slug: payload.slug,
          });
        }
      }
      await transaction
        .update(workspaces)
        .set({ name: payload.name, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(workspaces.id, id));
    });
    const row = await selectWorkspaceRow(id, db);
    if (!row) throw new WorkspaceError("workspace_not_found");
    return toWorkspace(row, [...workspacePermissions]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new WorkspaceError("workspace_slug_conflict");
    throw error;
  }
}

export async function getWorkspaceById(
  actor: Actor,
  id: string,
  db: Database = database,
): Promise<Workspace> {
  if (!z.string().uuid().safeParse(id).success) throw new WorkspaceError("workspace_not_found");
  const row = await selectWorkspaceRow(id, db);
  if (!row) throw new WorkspaceError("workspace_not_found");
  const visibility = parseVisibility(row.visibility);
  const permissions = await resolveWorkspacePermissions(
    actor,
    { id: row.id, ownerId: row.ownerId, visibility },
    db,
  );
  if (!permissions.includes("workspace.read")) throw new WorkspaceError("workspace_not_found");
  return toWorkspace(row, permissions);
}

export async function resolveWorkspace(
  actor: Actor,
  rawHandle: string,
  rawSlug: string,
  db: Database = database,
): Promise<Workspace> {
  const handle = handleSchema.safeParse(rawHandle);
  const slug = workspaceSlugSchema.safeParse(rawSlug);
  if (!handle.success || !slug.success) throw new WorkspaceError("workspace_not_found");

  const [locator] = await db
    .select({
      workspaceId: workspaceLocators.workspaceId,
      state: workspaceLocators.state,
    })
    .from(workspaceLocators)
    .innerJoin(principals, eq(workspaceLocators.ownerId, principals.id))
    .where(and(eq(principals.handle, handle.data), eq(workspaceLocators.slug, slug.data)))
    .limit(1);
  if (!locator) throw new WorkspaceError("workspace_not_found");
  const workspace = await getWorkspaceById(actor, locator.workspaceId, db);
  return { ...workspace, resolvedFromRedirect: locator.state === "redirect" };
}

export async function findWorkspaceAddressPreview(
  rawHandle: string,
  rawSlug: string,
  db: Database = database,
) {
  const handle = handleSchema.parse(rawHandle);
  const slug = workspaceSlugSchema.parse(rawSlug);
  const [row] = await db
    .select({
      name: workspaces.name,
      ownerHandle: principals.handle,
    })
    .from(workspaceLocators)
    .innerJoin(workspaces, eq(workspaces.id, workspaceLocators.workspaceId))
    .innerJoin(principals, eq(principals.id, workspaceLocators.ownerId))
    .where(
      and(
        eq(principals.handle, handle),
        eq(workspaceLocators.slug, slug),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
