"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { workspaceHref } from "@/features/workspaces/address";
import { WorkspaceError } from "@/features/workspaces/errors";
import { updateWorkspace } from "@/features/workspaces/service";
import type { WorkspaceSettingsFormState } from "@/features/workspaces/workbench/types";

const workspaceSettingsRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    conversationId: z.union([z.literal(""), z.string().uuid()]),
    name: z.string(),
    slug: z.string(),
  })
  .strict();

const allowedFields = new Set(["workspaceId", "conversationId", "name", "slug"]);

export async function updateWorkspaceFromForm(
  _state: WorkspaceSettingsFormState,
  formData: FormData,
): Promise<WorkspaceSettingsFormState> {
  for (const key of formData.keys()) {
    if (!allowedFields.has(key) && !key.startsWith("$ACTION_")) {
      return { code: "workspace_settings_invalid" };
    }
  }
  const parsed = workspaceSettingsRequestSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    conversationId: formData.get("conversationId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return { code: "workspace_settings_invalid" };

  const { workspaceId, conversationId, name, slug } = parsed.data;
  const currentPath = `/workspaces/${workspaceId}${conversationId ? `?conversation=${conversationId}` : ""}`;
  let destination: string;
  try {
    const workspace = await updateWorkspace(await getCurrentActor(), workspaceId, {
      name,
      slug: slug.trim() ? slug : null,
    });
    destination = `${workspaceHref(workspace)}${conversationId ? `?conversation=${conversationId}` : ""}`;
  } catch (error) {
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, currentPath);
      if (recoveryHref) redirect(recoveryHref);
    }
    if (error instanceof WorkspaceError && error.code === "workspace_slug_conflict") {
      return { code: "workspace_slug_conflict" };
    }
    if (error instanceof WorkspaceError && error.code === "workspace_slug_required") {
      return { code: "workspace_slug_required" };
    }
    if (error instanceof z.ZodError) return { code: "workspace_settings_invalid" };
    return { code: "workspace_settings_failed" };
  }

  redirect(destination);
}
