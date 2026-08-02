import { redirect } from "next/navigation";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { NewWorkspacePageView } from "@/features/workspaces/new/NewWorkspacePageView";
import { createWorkspaceFromForm } from "./actions";

export default async function NewWorkspacePage() {
  try {
    await getCurrentActor();
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, "/workspaces/new");
      if (recoveryHref) redirect(recoveryHref);
    }
    throw error;
  }
  return <NewWorkspacePageView createAction={createWorkspaceFromForm} />;
}
