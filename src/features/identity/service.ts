import "server-only";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { principals } from "@/database/schema";
import { IdentityError } from "./errors";
import { handleSchema } from "./handle";
import type { Actor } from "./types";

function toActor(principal: typeof principals.$inferSelect): Actor {
  if (principal.status !== "active" || principal.deletedAt !== null) {
    throw new IdentityError("principal_disabled");
  }
  return { principalId: principal.id, handle: principal.handle };
}

async function principalForAuthUser(authUserId: string, db: Database) {
  const [principal] = await db
    .select()
    .from(principals)
    .where(eq(principals.authUserId, authUserId))
    .limit(1);
  return principal;
}

export async function getActorForAuthUser(
  authUserId: string,
  db: Database = database,
): Promise<Actor> {
  const principal = await principalForAuthUser(authUserId, db);
  if (!principal) throw new IdentityError("onboarding_required");
  return toActor(principal);
}

export async function syncPrincipalEmailForAuthUser(
  authUserId: string,
  rawEmail: string,
  db: Database = database,
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;
  await db
    .update(principals)
    .set({ email })
    .where(
      and(
        eq(principals.authUserId, authUserId),
        or(isNull(principals.email), ne(principals.email, email)),
      ),
    );
}

export async function ensurePrincipalForAuthUser(
  authUserId: string,
  rawHandle: string,
  db: Database = database,
): Promise<Actor> {
  const handle = handleSchema.parse(rawHandle);
  const existing = await principalForAuthUser(authUserId, db);
  if (existing) {
    const actor = toActor(existing);
    if (actor.handle !== handle) throw new IdentityError("identity_already_bound");
    return actor;
  }

  const [created] = await db
    .insert(principals)
    .values({ authUserId, handle })
    .onConflictDoNothing()
    .returning();
  if (created) return toActor(created);

  // A concurrent request may have won either unique constraint.
  const bound = await principalForAuthUser(authUserId, db);
  if (bound) {
    const actor = toActor(bound);
    if (actor.handle !== handle) throw new IdentityError("identity_already_bound");
    return actor;
  }

  const [handleOwner] = await db
    .select({ id: principals.id })
    .from(principals)
    .where(eq(principals.handle, handle))
    .limit(1);
  if (handleOwner) throw new IdentityError("handle_unavailable");

  throw new Error("Unable to classify principal uniqueness conflict");
}
