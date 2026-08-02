import {
  renderWorkspacePage,
  type WorkspacePageSearchParams,
} from "@/app/(authenticated)/workspaces/WorkspacePage";
import { findWorkspaceAddressPreview, resolveWorkspace } from "@/features/workspaces/service";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; workspaceSlug: string }>;
  searchParams?: Promise<WorkspacePageSearchParams>;
}) {
  const { handle, workspaceSlug } = await params;
  const workspacePath = `/${encodeURIComponent(handle)}/${encodeURIComponent(workspaceSlug)}`;
  return renderWorkspacePage({
    accessDeniedPreview: () => findWorkspaceAddressPreview(handle, workspaceSlug),
    canonicalizeToSlug: false,
    resolveWorkspace: (actor) => resolveWorkspace(actor, handle, workspaceSlug),
    searchParams,
    workspacePath,
  });
}
