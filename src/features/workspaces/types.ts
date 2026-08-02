import type { WorkspacePermission } from "./policy";

export type Workspace = {
  id: string;
  ownerId: string;
  ownerHandle: string;
  slug: string | null;
  name: string;
  visibility: "private" | "public";
  firstSharedAt?: string | null;
  permissions?: WorkspacePermission[];
  resolvedFromRedirect?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
