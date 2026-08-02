import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArtifactError } from "@/features/artifacts/errors";
import { presentationEditorHref } from "@/features/artifacts/presentations/editor-route";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
} from "@/features/artifacts/workbench-server";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { workspaceHref } from "@/features/workspaces/address";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById } from "@/features/workspaces/service";
import { PresentationStandaloneEditorView } from "@/features/workspaces/workbench/PresentationStandaloneEditorView";

const routeInputSchema = z.object({
  artifactId: z.string().uuid(),
  conversationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export default async function PresentationEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams?: Promise<{
    conversation?: string | string[];
    workspaceId?: string | string[];
  }>;
}) {
  const [{ artifactId }, query] = await Promise.all([params, searchParams]);
  const parsed = routeInputSchema.safeParse({
    artifactId,
    conversationId: Array.isArray(query?.conversation) ? null : query?.conversation,
    workspaceId: Array.isArray(query?.workspaceId) ? null : query?.workspaceId,
  });
  if (!parsed.success) notFound();

  const currentHref = presentationEditorHref({
    artifactId: parsed.data.artifactId,
    conversationId: parsed.data.conversationId,
    workspaceId: parsed.data.workspaceId,
  });

  try {
    const actor = await getCurrentActor();
    const workspace = await getWorkspaceById(actor, parsed.data.workspaceId);
    const returnHref = `${workspaceHref(workspace)}?${new URLSearchParams({
      artifact: parsed.data.artifactId,
      conversation: parsed.data.conversationId,
    })}`;
    const detail = await getArtifactDetailForConversation(actor, {
      artifactId: parsed.data.artifactId,
      conversationId: parsed.data.conversationId,
      workspaceId: workspace.id,
    });
    if (detail.kind !== "presentation" || !detail.artifact) redirect(returnHref);
    const canManage = await canManageArtifactForConversation(actor, {
      artifactId: parsed.data.artifactId,
      conversationId: parsed.data.conversationId,
      workspaceId: workspace.id,
    });

    return (
      <PresentationStandaloneEditorView
        conversationId={parsed.data.conversationId}
        detail={detail}
        readOnly={!canManage}
        returnHref={returnHref}
        workspaceId={workspace.id}
      />
    );
  } catch (error) {
    if (
      (error instanceof ArtifactError && error.code === "artifact_not_found") ||
      (error instanceof WorkspaceError && error.code === "workspace_not_found")
    ) {
      notFound();
    }
    if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, currentHref);
      if (recoveryHref) redirect(recoveryHref);
    }
    throw error;
  }
}
