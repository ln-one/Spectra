"use server";

import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById, updateWorkspace } from "@/features/workspaces/service";
import {
  getWorkspaceSharingState,
  grantWorkspaceAccess,
  revokeWorkspaceAccess,
  searchWorkspaceInviteCandidates,
  setWorkspaceReferenceability,
  setWorkspaceVisibility,
  type WorkspaceSharingState,
} from "@/features/workspaces/sharing.server";
import type { WorkspaceSharingFormState } from "@/features/workspaces/workbench/types";

export async function searchWorkspaceInviteCandidatesAction(workspaceId: string, query: string) {
  try {
    return {
      ok: true as const,
      candidates: await searchWorkspaceInviteCandidates(
        await getCurrentActor(),
        workspaceId,
        query,
      ),
    };
  } catch {
    return {
      ok: false as const,
      candidates: [] as [],
      code: "workspace_invite_search_failed" as const,
    };
  }
}

const requestSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("invite"),
    workspaceId: z.string().uuid(),
    identity: z.string().trim().min(1).max(320),
  }),
  z.object({
    intent: z.literal("revoke"),
    workspaceId: z.string().uuid(),
    principalId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("visibility"),
    workspaceId: z.string().uuid(),
    visibility: z.enum(["private", "public"]),
  }),
  z.object({
    intent: z.literal("referenceability"),
    workspaceId: z.string().uuid(),
    referenceable: z.enum(["true", "false"]).transform((value) => value === "true"),
  }),
  z.object({
    intent: z.literal("slug"),
    workspaceId: z.string().uuid(),
    slug: z.string(),
  }),
]);

export async function updateWorkspaceSharingFromForm(
  state: WorkspaceSharingFormState,
  formData: FormData,
): Promise<WorkspaceSharingFormState> {
  const actor = await getCurrentActor();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { code: "workspace_share_identity_invalid", data: state.data };
  }
  try {
    let data: WorkspaceSharingState;
    switch (parsed.data.intent) {
      case "invite":
        data = await grantWorkspaceAccess(actor, parsed.data.workspaceId, parsed.data.identity);
        break;
      case "revoke":
        data = await revokeWorkspaceAccess(actor, parsed.data.workspaceId, parsed.data.principalId);
        break;
      case "visibility":
        data = await setWorkspaceVisibility(actor, parsed.data.workspaceId, parsed.data.visibility);
        break;
      case "referenceability":
        data = await setWorkspaceReferenceability(
          actor,
          parsed.data.workspaceId,
          parsed.data.referenceable,
        );
        break;
      case "slug": {
        const current = await getWorkspaceSharingState(actor, parsed.data.workspaceId);
        const workspace = await getWorkspaceById(actor, parsed.data.workspaceId);
        await updateWorkspace(actor, parsed.data.workspaceId, {
          name: workspace.name,
          slug: parsed.data.slug,
        });
        data = await getWorkspaceSharingState(actor, parsed.data.workspaceId);
        if (current.visibility === "public") {
          data = await setWorkspaceVisibility(actor, parsed.data.workspaceId, "public");
        }
        break;
      }
    }
    return { code: null, data };
  } catch (error) {
    if (error instanceof WorkspaceError) {
      if (error.code === "workspace_invitee_not_found") {
        return { code: "workspace_share_invitee_not_found", data: state.data };
      }
      if (error.code === "workspace_slug_conflict") {
        return { code: "workspace_share_slug_conflict", data: state.data };
      }
    }
    if (error instanceof z.ZodError) {
      return { code: "workspace_share_slug_invalid", data: state.data };
    }
    return { code: "workspace_share_failed", data: state.data };
  }
}
