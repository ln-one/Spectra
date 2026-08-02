import { getWorkspaceById } from "@/features/workspaces/service";
import { renderWorkspacePage, type WorkspacePageSearchParams } from "../WorkspacePage";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<WorkspacePageSearchParams>;
}) {
  const { id } = await params;
  const workspacePath = `/workspaces/${encodeURIComponent(id)}`;
  return renderWorkspacePage({
    canonicalizeToSlug: true,
    resolveWorkspace: (actor) => getWorkspaceById(actor, id),
    searchParams,
    workspacePath,
  });
}
