import "server-only";

import { cache } from "react";
import { getAuthSession } from "@/features/auth/session";
import { IdentityError } from "./errors";
import {
  ensurePrincipalForAuthUser,
  getActorForAuthUser,
  syncPrincipalEmailForAuthUser,
} from "./service";

async function currentAuthUser() {
  const session = await getAuthSession();
  if (!session) throw new IdentityError("authentication_required");
  return session.user;
}

export const getCurrentActor = cache(async () => {
  const user = await currentAuthUser();
  const actor = await getActorForAuthUser(user.id);
  await syncPrincipalEmailForAuthUser(user.id, user.email);
  return actor;
});

export async function ensureCurrentPrincipal(handle: string) {
  const user = await currentAuthUser();
  const actor = await ensurePrincipalForAuthUser(user.id, handle);
  await syncPrincipalEmailForAuthUser(user.id, user.email);
  return actor;
}
