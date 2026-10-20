import { redirect } from "next/navigation";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getAuthSession } from "@/features/auth/session";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { workspaceHref } from "@/features/workspaces/address";
import { MobileConversationEntry } from "@/features/workspaces/dashboard/MobileConversationEntry";
import { WorkspaceDashboardView } from "@/features/workspaces/dashboard/WorkspaceDashboardView";
import { listSharedWorkspaces, listWorkspaces } from "@/features/workspaces/service";
import {
  renameWorkspaceFromDashboard,
  setWorkspaceArchiveStateFromDashboard,
} from "../dashboard-actions";

export default async function WorkspacesPage() {
  try {
    const [session, actor] = await Promise.all([getAuthSession(), getCurrentActor()]);
    const [workspaces, sharedWorkspaces] = await Promise.all([
      listWorkspaces(actor),
      listSharedWorkspaces(actor),
    ]);
    const destinations = [...workspaces, ...sharedWorkspaces]
      .filter(
        (workspace) => !workspace.archivedAt && workspace.permissions?.includes("workspace.chat"),
      )
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
      .map((workspace) => ({ href: workspaceHref(workspace), name: workspace.name }));
    return (
      <MobileConversationEntry destinations={destinations}>
        <WorkspaceDashboardView
          accountMenu={
            <AccountMenu
              handle={actor.handle}
              email={session?.user.email ?? ""}
              appearance="dashboard"
            />
          }
          now={new Date().toISOString()}
          archiveAction={setWorkspaceArchiveStateFromDashboard}
          renameAction={renameWorkspaceFromDashboard}
          sharedWorkspaces={sharedWorkspaces}
          workspaces={workspaces}
        />
      </MobileConversationEntry>
    );
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, "/workspaces");
      if (recoveryHref) redirect(recoveryHref);
    }
    throw error;
  }
}
