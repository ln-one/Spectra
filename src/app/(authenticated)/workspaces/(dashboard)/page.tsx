import { redirect } from "next/navigation";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getAuthSession } from "@/features/auth/session";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
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
    return (
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
    );
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, "/workspaces");
      if (recoveryHref) redirect(recoveryHref);
    }
    throw error;
  }
}
