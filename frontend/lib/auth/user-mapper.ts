import type { UserInfo } from "../sdk/auth";
import type { User } from "./types";

export function toUser(userInfo: UserInfo): User {
  const raw = userInfo as Record<string, unknown>;
  return {
    id: userInfo.id,
    email: userInfo.email,
    username: userInfo.username,
    fullName: userInfo.fullName || (raw.full_name as string | undefined),
    createdAt:
      userInfo.createdAt ||
      (raw.created_at as string) ||
      new Date().toISOString(),
  };
}
