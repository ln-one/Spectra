import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  artifactCreationCapabilities,
  artifactPublishedCapabilities,
} from "@/features/artifacts/task-agent/config.server";
import { AccountMenu } from "@/features/auth/AccountMenu";
import { authRecoveryHref } from "@/features/auth/redirect";
import { getAuthSession } from "@/features/auth/session";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import type { Actor } from "@/features/identity/types";
import type { KnowledgeNetworkTrace } from "@/features/knowledge-network/model";
import { buildRealKnowledgeNetworkTrace } from "@/features/knowledge-network/real-trace";
import { workspaceHref } from "@/features/workspaces/address";
import { WorkspaceError } from "@/features/workspaces/errors";
import type { Workspace } from "@/features/workspaces/types";
import { loadWorkspaceBootstrap } from "@/features/workspaces/workbench/bootstrap.server";
import { WorkspaceAccessDenied } from "@/features/workspaces/workbench/WorkspaceAccessDenied";
import { WorkspaceWorkbenchView } from "@/features/workspaces/workbench/WorkspaceWorkbenchView";
import { updateWorkspaceFromForm } from "./settings-actions";
import {
  searchWorkspaceInviteCandidatesAction,
  updateWorkspaceSharingFromForm,
} from "./share-actions";
import { deleteWorkspaceThreadFromForm, renameWorkspaceThreadFromForm } from "./thread-actions";
import { WorkspaceSourcePanel } from "./WorkspaceSourcePanel";

export type WorkspacePageSearchParams = {
  artifact?: string | string[];
  conversation?: string | string[];
};

export async function renderWorkspacePage({
  accessDeniedPreview,
  canonicalizeToSlug,
  resolveWorkspace,
  searchParams,
  workspacePath,
}: {
  accessDeniedPreview?: () => Promise<{ name: string; ownerHandle: string } | null>;
  canonicalizeToSlug: boolean;
  resolveWorkspace: (actor: Actor) => Promise<Workspace>;
  searchParams: Promise<WorkspacePageSearchParams> | undefined;
  workspacePath: string;
}) {
  const resolvedSearchParams = await searchParams;
  const rawConversationId = resolvedSearchParams?.conversation;
  const rawArtifactId = resolvedSearchParams?.artifact;
  const parsedConversationId = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
    .safeParse(Array.isArray(rawConversationId) ? null : rawConversationId);
  if (rawConversationId !== undefined && !parsedConversationId.success) redirect(workspacePath);
  const requestedConversationId = parsedConversationId.success ? parsedConversationId.data : null;
  const conversationPath = `${workspacePath}${requestedConversationId ? `?conversation=${requestedConversationId}` : ""}`;
  const parsedArtifactId = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
    .safeParse(Array.isArray(rawArtifactId) ? null : rawArtifactId);
  if (rawArtifactId !== undefined && !parsedArtifactId.success) redirect(conversationPath);
  const requestedArtifactId = parsedArtifactId.success ? parsedArtifactId.data : null;
  const currentPath = `${conversationPath}${requestedConversationId && requestedArtifactId ? `&artifact=${requestedArtifactId}` : ""}`;

  let workspace: Workspace | null = null;
  let email: string | null = null;
  let actor: Actor | null = null;
  let bootstrap: Awaited<ReturnType<typeof loadWorkspaceBootstrap>> | null = null;
  let knowledgeNetworkTrace: KnowledgeNetworkTrace | null = null;
  let accessDenied: { name: string; ownerHandle: string } | null = null;
  try {
    const [session, currentActor] = await Promise.all([getAuthSession(), getCurrentActor()]);
    const resolvedWorkspace = await resolveWorkspace(currentActor);
    workspace = resolvedWorkspace;
    bootstrap = await loadWorkspaceBootstrap({
      actor: currentActor,
      emptyConversationId: randomUUID(),
      requestedArtifactId,
      requestedConversationId,
      workspace: resolvedWorkspace,
    });
    try {
      knowledgeNetworkTrace = await buildRealKnowledgeNetworkTrace({
        actor: currentActor,
        conversationId: bootstrap.conversationId,
        initialMessages: bootstrap.messages.items,
        initialSources: bootstrap.sources,
        workspace: resolvedWorkspace,
      });
    } catch {
      knowledgeNetworkTrace = null;
    }
    actor = currentActor;
    email = session?.user.email ?? "";
  } catch (error) {
    if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
      accessDenied = accessDeniedPreview ? await accessDeniedPreview().catch(() => null) : null;
      if (!accessDenied) notFound();
    } else if (error instanceof IdentityError) {
      const recoveryHref = authRecoveryHref(error, currentPath);
      if (recoveryHref) redirect(recoveryHref);
    } else {
      throw error;
    }
  }

  if (accessDenied) {
    return (
      <WorkspaceAccessDenied name={accessDenied.name} ownerHandle={accessDenied.ownerHandle} />
    );
  }
  if (!workspace || !bootstrap || !actor || email === null) notFound();

  if ((canonicalizeToSlug || workspace.resolvedFromRedirect) && workspace.slug) {
    const artifactSuffix =
      requestedConversationId && requestedArtifactId ? `&artifact=${requestedArtifactId}` : "";
    redirect(
      `${workspaceHref(workspace)}?conversation=${bootstrap.conversationId}${artifactSuffix}`,
    );
  }
  if (!requestedConversationId) {
    redirect(`${workspacePath}?conversation=${bootstrap.conversationId}`);
  }
  if (bootstrap.selectedArtifactMissing) redirect(conversationPath);
  return (
    <WorkspaceWorkbenchView
      key={bootstrap.conversationId}
      conversationId={bootstrap.conversationId}
      conversations={bootstrap.conversations.items}
      conversationNextCursor={bootstrap.conversations.nextCursor}
      deleteThreadAction={deleteWorkspaceThreadFromForm}
      initialMessages={bootstrap.messages.items}
      initialMessagesNextCursor={bootstrap.messages.nextCursor}
      initialArtifact={bootstrap.initialArtifact}
      initialArtifactCanManage={bootstrap.initialArtifactCanManage}
      initialArtifactHistory={bootstrap.artifactHistory}
      newConversationId={randomUUID()}
      renameThreadAction={renameWorkspaceThreadFromForm}
      sharingAction={updateWorkspaceSharingFromForm}
      sharingSearchAction={searchWorkspaceInviteCandidatesAction}
      sharingState={bootstrap.sharing}
      settingsAction={updateWorkspaceFromForm}
      workspace={workspace}
      knowledgeNetworkTrace={knowledgeNetworkTrace}
      taskAgentCapabilities={[...artifactPublishedCapabilities()]}
      taskAgentCreationCapabilities={[...artifactCreationCapabilities()]}
      accountMenu={
        <AccountMenu
          key="workspace-account-menu"
          handle={actor.handle}
          email={email}
          appearance="workbench"
        />
      }
      sourcesPanel={
        <WorkspaceSourcePanel
          canManage={Boolean(workspace.permissions?.includes("source.manage"))}
          conversationId={bootstrap.conversationId}
          workspaceId={workspace.id}
          initialSources={bootstrap.sources}
        />
      }
    />
  );
}
