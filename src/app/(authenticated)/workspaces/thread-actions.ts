"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteWorkspaceThread } from "@/features/agents/thread-deletion";
import { renameWorkspaceThread } from "@/features/agents/threads";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { workspaceHref } from "@/features/workspaces/address";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById } from "@/features/workspaces/service";
import type {
  WorkspaceThreadDeleteFormState,
  WorkspaceThreadRenameFormState,
} from "@/features/workspaces/workbench/types";

const threadScopeSchema = z
  .object({
    workspaceId: z.string().uuid(),
    conversationId: z.string().uuid(),
  })
  .strict();
const threadRenameRequestSchema = threadScopeSchema.extend({ title: z.string() }).strict();

const scopeFields = new Set(["workspaceId", "conversationId"]);
const renameFields = new Set([...scopeFields, "title"]);

function hasOnlyFields(formData: FormData, allowedFields: ReadonlySet<string>) {
  for (const key of formData.keys()) {
    if (!allowedFields.has(key) && !key.startsWith("$ACTION_")) return false;
  }
  return true;
}

export async function renameWorkspaceThreadFromForm(
  _state: WorkspaceThreadRenameFormState,
  formData: FormData,
): Promise<WorkspaceThreadRenameFormState> {
  if (!hasOnlyFields(formData, renameFields)) return { code: "thread_title_invalid" };
  const parsed = threadRenameRequestSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    conversationId: formData.get("conversationId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return { code: "thread_title_invalid" };

  const { workspaceId, conversationId, title } = parsed.data;
  const currentPath = `/workspaces/${workspaceId}?conversation=${conversationId}`;
  let destination: string;
  try {
    const actor = await getCurrentActor();
    const workspace = await getWorkspaceById(actor, workspaceId);
    const renamed = await renameWorkspaceThread(
      workspace,
      conversationId,
      title,
      actor.principalId,
    );
    if (!renamed) return { code: "thread_not_found" };
    destination = `${workspaceHref(workspace)}?conversation=${conversationId}`;
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, currentPath);
      if (recoveryHref) redirect(recoveryHref);
    }
    if (error instanceof z.ZodError) return { code: "thread_title_invalid" };
    if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
      return { code: "thread_not_found" };
    }
    return { code: "thread_rename_failed" };
  }

  redirect(destination);
}

export async function deleteWorkspaceThreadFromForm(
  _state: WorkspaceThreadDeleteFormState,
  formData: FormData,
): Promise<WorkspaceThreadDeleteFormState> {
  if (!hasOnlyFields(formData, scopeFields)) return { code: "thread_delete_failed" };
  const parsed = threadScopeSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) return { code: "thread_delete_failed" };

  const { workspaceId, conversationId } = parsed.data;
  const currentPath = `/workspaces/${workspaceId}?conversation=${conversationId}`;
  let destination: string;
  try {
    const actor = await getCurrentActor();
    const workspace = await getWorkspaceById(actor, workspaceId);
    const deleted = await deleteWorkspaceThread(workspace, conversationId, {
      createdByPrincipalId: actor.principalId,
    });
    if (!deleted) return { code: "thread_not_found" };
    destination = workspaceHref(workspace);
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, currentPath);
      if (recoveryHref) redirect(recoveryHref);
    }
    if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
      return { code: "thread_not_found" };
    }
    return { code: "thread_delete_failed" };
  }

  redirect(destination);
}
