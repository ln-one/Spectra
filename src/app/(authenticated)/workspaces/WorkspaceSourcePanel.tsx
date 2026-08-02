"use client";

import type { SourceClientActions } from "@/features/sources/client-actions";
import type { Source } from "@/features/sources/types";
import { SourcesPanel } from "@/features/sources/ui/SourcesPanel";
import {
  addWorkspaceReferenceAction,
  completeSourceUploadAction,
  deleteSourceAction,
  listSourcesAction,
  listWorkspaceReferenceCandidatesAction,
  prepareSourceUploadAction,
  resolveWorkspaceReferenceLocatorAction,
  startSourceIngestionAction,
  startSourceUploadAction,
} from "./source-actions";

const actions: SourceClientActions = {
  list: listSourcesAction,
  listReferenceCandidates: listWorkspaceReferenceCandidatesAction,
  resolveReferenceLocator: resolveWorkspaceReferenceLocatorAction,
  addReference: addWorkspaceReferenceAction,
  start: startSourceUploadAction,
  prepare: prepareSourceUploadAction,
  complete: completeSourceUploadAction,
  ingest: startSourceIngestionAction,
  remove: deleteSourceAction,
};

export function WorkspaceSourcePanel({
  canManage,
  conversationId,
  initialSources,
  workspaceId,
}: {
  canManage: boolean;
  conversationId: string;
  initialSources: Source[];
  workspaceId: string;
}) {
  return (
    <SourcesPanel
      actions={actions}
      canManage={canManage}
      conversationId={conversationId}
      initialSources={initialSources}
      workspaceId={workspaceId}
    />
  );
}
