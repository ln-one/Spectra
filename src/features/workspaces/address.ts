import type { Workspace } from "./types";

export function workspaceHref(workspace: Pick<Workspace, "id" | "ownerHandle" | "slug">) {
  return workspace.slug
    ? `/${workspace.ownerHandle}/${workspace.slug}`
    : `/workspaces/${workspace.id}`;
}
