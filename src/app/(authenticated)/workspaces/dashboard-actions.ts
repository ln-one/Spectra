"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import type {
  WorkspaceArchiveFormState,
  WorkspaceRenameFormState,
} from "@/features/workspaces/dashboard/types";
import { WorkspaceError } from "@/features/workspaces/errors";
import { renameWorkspace, setWorkspaceArchiveState } from "@/features/workspaces/service";

const workspaceRenameRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    name: z.string(),
  })
  .strict();

const workspaceArchiveRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    operation: z.enum(["archive", "restore"]),
  })
  .strict();

const workspaceRenameFields = new Set(["workspaceId", "name"]);
const workspaceArchiveFields = new Set(["workspaceId", "operation"]);

function hasOnlyAllowedFields(formData: FormData, allowedFields: ReadonlySet<string>) {
  for (const key of formData.keys()) {
    if (!allowedFields.has(key) && !key.startsWith("$ACTION_")) return false;
  }
  return true;
}

function recoverIdentity(error: unknown): never | undefined {
  if (!(error instanceof IdentityError)) return;
  const recoveryHref = authRecoveryHref(error, "/workspaces");
  if (recoveryHref) redirect(recoveryHref);
}

export async function renameWorkspaceFromDashboard(
  _state: WorkspaceRenameFormState,
  formData: FormData,
): Promise<WorkspaceRenameFormState> {
  if (!hasOnlyAllowedFields(formData, workspaceRenameFields)) {
    return { status: "error", code: "workspace_name_invalid" };
  }
  const parsed = workspaceRenameRequestSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { status: "error", code: "workspace_name_invalid" };

  try {
    const workspace = await renameWorkspace(
      await getCurrentActor(),
      parsed.data.workspaceId,
      parsed.data.name,
    );
    revalidatePath("/workspaces");
    return { status: "success", workspaceName: workspace.name };
  } catch (error) {
    recoverIdentity(error);
    if (error instanceof z.ZodError) {
      return { status: "error", code: "workspace_name_invalid" };
    }
    if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
      return { status: "error", code: "workspace_not_found" };
    }
    return { status: "error", code: "workspace_rename_failed" };
  }
}

export async function setWorkspaceArchiveStateFromDashboard(
  _state: WorkspaceArchiveFormState,
  formData: FormData,
): Promise<WorkspaceArchiveFormState> {
  if (!hasOnlyAllowedFields(formData, workspaceArchiveFields)) {
    return { status: "error", code: "workspace_archive_failed" };
  }
  const parsed = workspaceArchiveRequestSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    operation: formData.get("operation"),
  });
  if (!parsed.success) return { status: "error", code: "workspace_archive_failed" };

  try {
    const workspace = await setWorkspaceArchiveState(
      await getCurrentActor(),
      parsed.data.workspaceId,
      parsed.data.operation === "archive" ? "archived" : "active",
    );
    revalidatePath("/workspaces");
    return {
      status: "success",
      operation: parsed.data.operation,
      workspaceName: workspace.name,
    };
  } catch (error) {
    recoverIdentity(error);
    if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
      return { status: "error", code: "workspace_not_found" };
    }
    return { status: "error", code: "workspace_archive_failed" };
  }
}
