"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UppyContextProvider, useUppyState } from "@uppy/react";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import { useArtifactSourceTransition } from "@/features/workspaces/workbench/ArtifactSourceTransitionContext";
import { moveArtifactIntoHistory } from "@/features/workspaces/workbench/artifactSourceMembership";
import { SourcesPanelView } from "@/features/workspaces/workbench/SourcesPanelView";
import type { SourceItemViewModel } from "@/features/workspaces/workbench/types";
import type { SourceActionErrorCode, SourceClientActions } from "../client-actions";
import type { ArtifactSource, Source, SourceIngestionErrorCode } from "../types";
import { sourceMediaKind } from "../validation";
import { SourceDropTarget } from "./SourceDropTarget";
import { SourceImportControl } from "./SourceImportControl";
import {
  artifactSourcePresentation,
  sourceFilePresentation,
  workspaceSourcePresentation,
} from "./source-file-presentation";
import { useSourceUploader } from "./useSourceUploader";
import { WorkspaceReferenceDialog } from "./WorkspaceReferenceDialog";

const SOURCE_QUERY_STALE_TIME = 60_000;
const KNOWLEDGE_INDEX_SCHEDULING_GRACE_MS = 60_000;

export function sourceNeedsStatusRefresh(source: Source, now = Date.now()) {
  if (source.kind === "workspaceReference") return false;
  if (source.kind === "artifact") {
    if (
      source.knowledgeIndex?.state === "queued" ||
      source.knowledgeIndex?.state === "projecting" ||
      source.knowledgeIndex?.state === "publishing"
    ) {
      return true;
    }
    return (
      source.knowledgeIndex === undefined &&
      now - Date.parse(source.updatedAt) < KNOWLEDGE_INDEX_SCHEDULING_GRACE_MS
    );
  }
  if (source.ingestion?.state === "queued" || source.ingestion?.state === "processing") return true;
  if (source.ingestion?.state !== "ready") return false;
  if (
    source.knowledgeIndex?.state === "queued" ||
    source.knowledgeIndex?.state === "projecting" ||
    source.knowledgeIndex?.state === "publishing"
  ) {
    return true;
  }
  return (
    source.knowledgeIndex === undefined &&
    now - Date.parse(source.ingestion.updatedAt) < KNOWLEDGE_INDEX_SCHEDULING_GRACE_MS
  );
}

const errorTranslationKeys = {
  authentication_required: "errors.authenticationRequired",
  onboarding_required: "errors.onboardingRequired",
  principal_disabled: "errors.principalDisabled",
  handle_unavailable: "errors.actionFailed",
  identity_already_bound: "errors.actionFailed",
  source_not_found: "errors.notFound",
  source_file_type_unsupported: "errors.fileTypeUnsupported",
  source_file_too_large: "errors.fileTooLarge",
  source_workspace_quota_exceeded: "errors.workspaceQuotaExceeded",
  source_upload_expired: "errors.uploadExpired",
  source_upload_incomplete: "errors.uploadIncomplete",
  source_upload_mismatch: "errors.uploadMismatch",
  source_invalid_state: "errors.invalidState",
  source_storage_unavailable: "errors.storageUnavailable",
  source_input_invalid: "errors.inputInvalid",
  source_action_failed: "errors.actionFailed",
} as const satisfies Record<SourceActionErrorCode, string>;

const ingestionErrorTranslationKeys = {
  source_not_stored: "ingestionErrors.notStored",
  source_ingestion_unavailable: "ingestionErrors.unavailable",
  architecture_reset: "ingestionErrors.unavailable",
  provider_submission_unknown: "ingestionErrors.unavailable",
  mineru_unavailable: "ingestionErrors.unavailable",
  mineru_timeout: "ingestionErrors.timeout",
  mineru_resource_limit: "ingestionErrors.resourceLimit",
  mineru_quota_exceeded: "ingestionErrors.quotaExceeded",
  mineru_authentication: "ingestionErrors.configuration",
  mineru_input_rejected: "ingestionErrors.inputRejected",
  mineru_task_not_found: "ingestionErrors.taskLost",
  mineru_provider_failed: "ingestionErrors.providerFailed",
  mineru_result_invalid: "ingestionErrors.resultInvalid",
  media_authentication: "ingestionErrors.configuration",
  media_rate_limited: "ingestionErrors.quotaExceeded",
  media_input_rejected: "ingestionErrors.inputRejected",
  media_timeout: "ingestionErrors.timeout",
  media_unavailable: "ingestionErrors.unavailable",
  media_result_invalid: "ingestionErrors.resultInvalid",
  media_aborted: "ingestionErrors.aborted",
  native_input_rejected: "ingestionErrors.inputRejected",
} as const satisfies Record<SourceIngestionErrorCode, string>;

export function SourcesPanel({
  actions,
  canManage = true,
  conversationId,
  initialSources,
  workspaceId,
}: {
  actions: SourceClientActions;
  canManage?: boolean;
  conversationId?: string;
  initialSources: Source[];
  workspaceId: string;
}) {
  return (
    <SourcesPanelContent
      actions={actions}
      canManage={canManage}
      {...(conversationId ? { conversationId } : {})}
      initialSources={initialSources}
      workspaceId={workspaceId}
    />
  );
}

function SourcesPanelContent({
  actions,
  canManage,
  conversationId,
  initialSources,
  workspaceId,
}: {
  actions: SourceClientActions;
  canManage: boolean;
  conversationId?: string;
  initialSources: Source[];
  workspaceId: string;
}) {
  const t = useTranslations("Sources");
  const artifactSourceTransition = useArtifactSourceTransition();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["workspace", workspaceId, "sources"] as const, [workspaceId]);
  const message = (code: SourceActionErrorCode) => t(errorTranslationKeys[code]);
  const [deleteTarget, setDeleteTarget] = useState<SourceItemViewModel | null>(null);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [processingSourceId, setProcessingSourceId] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);

  const { data: sources = initialSources } = useQuery({
    queryKey,
    initialData: initialSources,
    staleTime: SOURCE_QUERY_STALE_TIME,
    queryFn: async () => {
      const result = await actions.list(workspaceId);
      if (result.ok) return result.data;
      throw new Error(message(result.code));
    },
    refetchInterval: (query) =>
      query.state.data?.some((source) => sourceNeedsStatusRefresh(source)) ? 3_000 : false,
  });

  const uppy = useSourceUploader({
    actions,
    actionFailedMessage: t("errors.actionFailed"),
    errorMessage: message,
    queryKey,
    workspaceId,
  });
  const queuedFiles = useUppyState(uppy, (state) => state.files);
  const uploadError = useUppyState(
    uppy,
    (state) => state.info.filter((notice) => notice.type === "error").at(-1)?.message ?? null,
  );
  const queuedSourceStates = useMemo(() => {
    const states = new Map<
      string,
      {
        canRetry: boolean;
        percentage?: number;
        uploadComplete: boolean;
      }
    >();
    for (const file of Object.values(queuedFiles)) {
      if (typeof file.meta.sourceId === "string") {
        const percentage =
          typeof file.progress.percentage === "number"
            ? Math.min(100, Math.max(0, Math.round(file.progress.percentage)))
            : undefined;
        states.set(file.meta.sourceId, {
          canRetry: Boolean(file.error),
          uploadComplete: Boolean(file.progress.uploadComplete),
          ...(percentage !== undefined ? { percentage } : {}),
        });
      }
    }
    return states;
  }, [queuedFiles]);

  const orderedSources = useMemo(
    () => [
      ...sources.filter((source) => source.kind === "workspaceReference"),
      ...sources.filter((source) => source.kind === "artifact"),
      ...sources.filter((source) => source.kind === "uploadedFile"),
    ],
    [sources],
  );

  const viewSources = orderedSources.map<SourceItemViewModel>((source) => {
    if (source.kind === "workspaceReference") {
      const presentation = workspaceSourcePresentation(source.accessState === "unavailable");
      if (source.accessState === "unavailable") {
        return {
          id: source.id,
          name: t("workspaceReference.unavailableName"),
          status: t("workspaceReference.unavailableStatus"),
          statusTone: "error",
          kind: "workspace",
          selected: false,
          canOpen: false,
          canDelete: canManage,
          unavailable: true,
          Icon: presentation.Icon,
          typeLabel: t("workspaceReference.typeLabel"),
          iconTone: presentation.iconTone,
        };
      }
      return {
        id: source.id,
        name: source.targetWorkspace.name,
        status: t("workspaceReference.sourceStatus"),
        statusTone: "success",
        kind: "workspace",
        selected: false,
        canOpen: true,
        openHref: source.targetWorkspace.canonicalHref,
        canDelete: canManage,
        Icon: presentation.Icon,
        typeLabel: t("workspaceReference.typeLabel"),
        iconTone: presentation.iconTone,
      };
    }
    if (source.kind === "artifact") {
      const presentation = artifactSourcePresentation(source.artifact.kind);
      let status = t("status.indexQueued");
      let statusTone: "active" | "pending" | "success" | "error" = "pending";
      if (source.knowledgeIndex?.state === "projecting") {
        status = t("status.indexProjecting");
        statusTone = "active";
      } else if (source.knowledgeIndex?.state === "publishing") {
        status = t("status.indexPublishing");
        statusTone = "active";
      } else if (source.knowledgeIndex?.state === "ready") {
        status = t("status.indexReady", { count: source.knowledgeIndex.chunkCount });
        statusTone = "success";
      } else if (source.knowledgeIndex?.state === "failed") {
        status = source.knowledgeIndex.nextRetryAt
          ? t("status.indexRetryScheduled")
          : t("status.indexFailed");
        statusTone = "error";
      }
      return {
        id: source.id,
        artifactId: source.artifact.id,
        conversationId: source.artifact.conversationId,
        name: source.artifact.title,
        status,
        statusTone,
        kind: "artifact",
        artifactKind: source.artifact.kind,
        artifactTone: presentation.tone,
        selected: false,
        canOpen: true,
        openHref: `?conversation=${encodeURIComponent(conversationId ?? source.artifact.conversationId)}&artifact=${encodeURIComponent(source.artifact.id)}`,
        canDelete: canManage,
        Icon: presentation.Icon,
        typeLabel: t(`artifact.typeLabels.${source.artifact.kind}`),
      };
    }
    const queuedState = queuedSourceStates.get(source.id);
    const isVideo = sourceMediaKind(source.originalFilename) === "video";
    let status = t("status.pending");
    let statusTone: "active" | "pending" | "success" | "error" = "pending";
    let uploadProgress: number | undefined;
    let canRetryUpload = false;
    if (source.state === "stored") {
      if (!source.ingestion || source.ingestion.state === "obsolete") {
        status = t("status.stored");
      } else if (source.ingestion.state === "queued") {
        status =
          source.ingestion.provider === "media_understanding"
            ? t(isVideo ? "status.videoQueued" : "status.audioQueued")
            : t("status.queued");
        statusTone = "pending";
      } else if (source.ingestion.state === "processing") {
        status =
          source.ingestion.provider === "media_understanding"
            ? t(isVideo ? "status.videoProcessing" : "status.audioProcessing")
            : t("status.processing");
        statusTone = "active";
      } else if (source.ingestion.state === "ready") {
        if (source.knowledgeIndex?.state === "queued") {
          status = t("status.indexQueued");
          statusTone = "pending";
        } else if (source.knowledgeIndex?.state === "projecting") {
          status = t("status.indexProjecting");
          statusTone = "active";
        } else if (source.knowledgeIndex?.state === "publishing") {
          status = t("status.indexPublishing");
          statusTone = "active";
        } else if (source.knowledgeIndex?.state === "ready") {
          status = t("status.indexReady", { count: source.knowledgeIndex.chunkCount });
          statusTone = "success";
        } else if (source.knowledgeIndex?.state === "failed") {
          status = source.knowledgeIndex.nextRetryAt
            ? t("status.indexRetryScheduled")
            : t("status.indexFailed");
          statusTone = "error";
        } else {
          status =
            source.ingestion.provider === "media_understanding"
              ? t(isVideo ? "status.videoReady" : "status.audioReady")
              : t("status.ready");
          statusTone = "pending";
        }
      } else if (source.ingestion.state === "failed") {
        status = source.ingestion.errorCode
          ? t(ingestionErrorTranslationKeys[source.ingestion.errorCode])
          : t("status.processingFailed");
        statusTone = "error";
      }
    } else if (source.state === "failed") {
      status = source.failureCode ? message(source.failureCode) : t("status.failed");
      statusTone = "error";
    } else if (queuedState?.canRetry) {
      status = t("status.retry");
      statusTone = "error";
      canRetryUpload = true;
    } else if (!queuedState) {
      status = t("status.reselect");
      statusTone = "error";
    } else if (queuedState.uploadComplete) {
      status = t("status.confirming");
      statusTone = "active";
    } else if (queuedState.percentage !== undefined) {
      status = t("status.uploading", { progress: queuedState.percentage });
      statusTone = "active";
      uploadProgress = queuedState.percentage;
    } else {
      status = t("status.preparing");
      statusTone = "active";
    }
    return {
      id: source.id,
      name: source.originalFilename,
      status,
      statusTone,
      kind: "file",
      selected: false,
      canOpen: false,
      canDelete: canManage,
      canRetryUpload: canManage && canRetryUpload,
      ...(uploadProgress !== undefined ? { uploadProgress } : {}),
      canProcess:
        canManage &&
        source.state === "stored" &&
        (!source.ingestion ||
          source.ingestion.state === "obsolete" ||
          (source.ingestion.state === "failed" && source.ingestion.retryable)),
      ...sourceFilePresentation(source.originalFilename),
    };
  });

  function retrySourceUpload(source: SourceItemViewModel) {
    const queuedFile = uppy.getFiles().find((file) => file.meta.sourceId === source.id);
    if (!queuedFile?.error) return;
    void uppy.retryUpload(queuedFile.id);
  }

  async function processSource(source: SourceItemViewModel) {
    setProcessingSourceId(source.id);
    setProcessError(null);
    try {
      const result = await actions.ingest(source.id);
      if (!result.ok) {
        setProcessError(message(result.code));
        return;
      }
      queryClient.setQueryData<Source[]>(queryKey, (current) =>
        current?.map((item) =>
          item.id === source.id && item.kind === "uploadedFile"
            ? { ...item, ingestion: result.data }
            : item,
        ),
      );
    } catch {
      setProcessError(t("errors.actionFailed"));
    } finally {
      setProcessingSourceId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const artifactSource =
      deleteTarget.kind === "artifact"
        ? sources.find(
            (source): source is ArtifactSource =>
              source.kind === "artifact" && source.id === deleteTarget.id,
          )
        : undefined;
    setDeletingSourceId(deleteTarget.id);
    setDeleteError(null);
    const queuedFile = uppy.getFiles().find((file) => file.meta.sourceId === deleteTarget.id);
    if (queuedFile) uppy.removeFile(queuedFile.id);
    let result: Awaited<ReturnType<SourceClientActions["remove"]>>;
    try {
      result = await actions.remove(deleteTarget.id);
    } catch {
      setDeleteError(t("errors.actionFailed"));
      setDeletingSourceId(null);
      return;
    }
    if (!result.ok) {
      setDeleteError(message(result.code));
      setDeletingSourceId(null);
      return;
    }
    await queryClient.cancelQueries({ queryKey });
    const updateCaches = () => {
      if (artifactSource) {
        const historyQueryKey = [
          "workspace",
          workspaceId,
          "conversation",
          artifactSource.artifact.conversationId,
          "artifacts",
        ] as const;
        const next = moveArtifactIntoHistory(
          queryClient.getQueryData<ArtifactHistoryItem[]>(historyQueryKey) ?? [],
          queryClient.getQueryData<Source[]>(queryKey) ?? [],
          artifactSource,
        );
        queryClient.setQueryData(historyQueryKey, next.history);
        queryClient.setQueryData(queryKey, next.sources);
      } else {
        queryClient.setQueryData<Source[]>(queryKey, (current) =>
          current?.filter((source) => source.id !== deleteTarget.id),
        );
      }
      setDeletingSourceId(null);
      setDeleteTarget(null);
    };
    if (artifactSource && artifactSourceTransition) {
      await artifactSourceTransition.run(artifactSource.artifact.id, "history", updateCaches);
    } else {
      updateCaches();
    }
    if (artifactSource) {
      await queryClient.invalidateQueries({
        queryKey: [
          "workspace",
          workspaceId,
          "conversation",
          artifactSource.artifact.conversationId,
          "artifacts",
        ],
      });
    }
    await queryClient.invalidateQueries({ queryKey });
  }

  return (
    <UppyContextProvider uppy={uppy}>
      <SourceDropTarget disabled={!canManage}>
        <SourcesPanelView
          title={t("title")}
          summary={t("summary", { count: sources.length })}
          {...(!canManage ? { permissionNotice: t("permissionFiltered") } : {})}
          sources={viewSources}
          {...(canManage
            ? {
                importControl: (
                  <SourceImportControl onReferenceWorkspace={() => setReferenceDialogOpen(true)} />
                ),
              }
            : {})}
          deletingSourceId={deletingSourceId}
          processingSourceId={processingSourceId}
          processError={processError}
          uploadError={uploadError}
          onDismissUploadError={() => uppy.hideInfo()}
          {...(canManage
            ? {
                onRequestProcess: processSource,
                onRequestRetryUpload: retrySourceUpload,
              }
            : {})}
          onRequestOpen={(source, sourceElement) => {
            if (
              source.kind !== "artifact" ||
              !source.artifactId ||
              !source.conversationId ||
              !source.openHref ||
              !artifactSourceTransition
            ) {
              return;
            }
            void artifactSourceTransition.open({
              artifactId: source.artifactId,
              conversationId: source.conversationId,
              href: source.openHref,
              sourceElement,
            });
          }}
          onRequestPrefetch={(source) => {
            if (
              source.kind !== "artifact" ||
              !source.artifactId ||
              !source.conversationId ||
              !artifactSourceTransition
            ) {
              return;
            }
            void artifactSourceTransition.prefetch({
              artifactId: source.artifactId,
              conversationId: source.conversationId,
            });
          }}
          {...(canManage
            ? {
                onRequestDelete: (source: SourceItemViewModel) => {
                  setDeleteError(null);
                  setDeleteTarget(source);
                },
              }
            : {})}
        />
      </SourceDropTarget>
      <AlertDialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingSourceId) setDeleteTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl">
            <AlertDialog.Title className="text-lg font-semibold">
              {deleteTarget?.kind === "workspace"
                ? t("workspaceReference.removeTitle")
                : deleteTarget?.kind === "artifact"
                  ? t("artifact.removeTitle")
                  : t("deleteTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
              {deleteTarget?.kind === "workspace"
                ? deleteTarget.unavailable
                  ? t("workspaceReference.removeUnavailableDescription")
                  : t("workspaceReference.removeDescription", {
                      name: deleteTarget?.name ?? "",
                    })
                : deleteTarget?.kind === "artifact"
                  ? t("artifact.removeDescription", { name: deleteTarget?.name ?? "" })
                  : t("deleteDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialog.Description>
            {deleteError ? (
              <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  disabled={deletingSourceId !== null}
                  className="rounded-lg border border-[var(--app-border-strong)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--app-text)] transition-[background-color,border-color,transform] duration-150 hover:bg-[var(--app-surface-muted)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface)] disabled:cursor-wait disabled:opacity-55 disabled:active:scale-100"
                >
                  {t("cancel")}
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                disabled={deletingSourceId !== null}
                onClick={confirmDelete}
                aria-busy={deletingSourceId !== null}
                style={{
                  backgroundColor: "var(--app-danger-solid)",
                  color: "var(--app-on-danger)",
                }}
                className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-[filter,transform,box-shadow] duration-150 hover:brightness-110 hover:shadow-md active:scale-[0.97] active:brightness-90 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-danger-solid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface)] disabled:cursor-wait disabled:opacity-65 disabled:active:scale-100"
              >
                {deletingSourceId ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {deletingSourceId
                  ? deleteTarget?.kind === "workspace"
                    ? t("workspaceReference.removing")
                    : deleteTarget?.kind === "artifact"
                      ? t("artifact.removing")
                      : t("deleting")
                  : deleteTarget?.kind === "workspace"
                    ? t("workspaceReference.remove")
                    : deleteTarget?.kind === "artifact"
                      ? t("artifact.remove")
                      : t("delete")}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <WorkspaceReferenceDialog
        actions={actions}
        errorMessage={message}
        onOpenChange={setReferenceDialogOpen}
        open={referenceDialogOpen}
        sourceQueryKey={queryKey}
        workspaceId={workspaceId}
      />
    </UppyContextProvider>
  );
}
