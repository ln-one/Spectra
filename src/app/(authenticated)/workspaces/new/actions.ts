"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { workspaceHref } from "@/features/workspaces/address";
import { workspaceInputFromCreationIntent } from "@/features/workspaces/new/intent";
import type { CreateWorkspaceFormState } from "@/features/workspaces/new/types";
import { createWorkspace } from "@/features/workspaces/service";

export async function createWorkspaceFromForm(
  _state: CreateWorkspaceFormState,
  formData: FormData,
): Promise<CreateWorkspaceFormState> {
  let workspaceInput: ReturnType<typeof workspaceInputFromCreationIntent>;
  try {
    workspaceInput = workspaceInputFromCreationIntent({
      idea: formData.get("idea"),
      projectName: formData.get("projectName") ?? "",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { code: "workspace_input_invalid" };
    return { code: "workspace_creation_failed" };
  }

  let destination: string;
  try {
    const workspace = await createWorkspace(await getCurrentActor(), workspaceInput);
    destination = workspaceHref(workspace);
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, "/workspaces/new");
      if (recoveryHref) redirect(recoveryHref);
    }
    return { code: "workspace_creation_failed" };
  }

  redirect(destination);
}
