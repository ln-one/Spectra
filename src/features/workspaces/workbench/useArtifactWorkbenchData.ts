"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { type ArtifactDetail, artifactDetailSchema } from "@/features/artifacts/contract";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import {
  artifactWorkbenchQueryKeys,
  dismissArtifactProposal,
  fetchArtifactDetail,
  fetchArtifactHistory,
  fetchCurrentArtifactProposal,
  upsertArtifactHistory,
} from "@/features/artifacts/workbench-client";
import {
  artifactDetailRefetchInterval,
  artifactHistoryRefetchInterval,
  newestArtifactDetail,
} from "./artifactWorkbench";
import { useArtifactLiveUpdates } from "./useArtifactLiveUpdates";

export function useArtifactWorkbenchData(input: {
  conversationId: string;
  initialArtifact: ArtifactDetail | null;
  initialArtifactHistory: readonly ArtifactHistoryItem[];
  selectedArtifactId: string | null;
  unavailableArtifactIds: ReadonlySet<string>;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const historyQueryKey = useMemo(
    () => artifactWorkbenchQueryKeys.history(input.workspaceId, input.conversationId),
    [input.conversationId, input.workspaceId],
  );
  const historyQuery = useQuery({
    initialData: [...input.initialArtifactHistory],
    queryFn: () => fetchArtifactHistory(input.workspaceId, input.conversationId),
    queryKey: historyQueryKey,
    refetchInterval: (query) => artifactHistoryRefetchInterval(query.state.data),
    staleTime: 30_000,
  });

  useEffect(() => {
    queryClient.setQueryData<ArtifactHistoryItem[]>(historyQueryKey, [
      ...input.initialArtifactHistory,
    ]);
  }, [historyQueryKey, input.initialArtifactHistory, queryClient]);

  const visibleArtifactHistory = useMemo(
    () => historyQuery.data.filter((artifact) => !input.unavailableArtifactIds.has(artifact.id)),
    [historyQuery.data, input.unavailableArtifactIds],
  );
  const artifactQueryKey = artifactWorkbenchQueryKeys.detail(
    input.workspaceId,
    input.conversationId,
    input.selectedArtifactId ?? "none",
  );
  const artifactQuery = useQuery({
    enabled: input.selectedArtifactId !== null,
    initialData:
      input.initialArtifact && input.initialArtifact.id === input.selectedArtifactId
        ? input.initialArtifact
        : undefined,
    queryFn: () => {
      if (!input.selectedArtifactId) throw new Error("artifact_not_selected");
      return fetchArtifactDetail({
        artifactId: input.selectedArtifactId,
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
      });
    },
    queryKey: artifactQueryKey,
    refetchInterval: (query) => artifactDetailRefetchInterval(query.state.data),
    staleTime: 30_000,
    structuralSharing: (cached, server) => {
      const parsedServer = artifactDetailSchema.safeParse(server);
      if (!parsedServer.success) return server;
      const parsedCached = artifactDetailSchema.safeParse(cached);
      return (
        newestArtifactDetail(
          parsedCached.success ? parsedCached.data : undefined,
          parsedServer.data,
          input.selectedArtifactId,
        ) ?? parsedServer.data
      );
    },
  });
  const artifactDetail = newestArtifactDetail(
    artifactQuery.data,
    input.initialArtifact,
    input.selectedArtifactId,
  );
  const currentRevisionId = artifactDetail?.artifact?.currentRevision.id ?? null;
  const proposalQueryKey = artifactWorkbenchQueryKeys.proposal(
    input.workspaceId,
    input.conversationId,
    input.selectedArtifactId ?? "none",
  );
  const proposalQuery = useQuery({
    enabled: input.selectedArtifactId !== null && currentRevisionId !== null,
    queryFn: () => {
      if (!input.selectedArtifactId) throw new Error("artifact_not_selected");
      return fetchCurrentArtifactProposal({
        artifactId: input.selectedArtifactId,
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
      });
    },
    queryKey: proposalQueryKey,
    refetchInterval: (query) =>
      artifactDetail?.kind === "presentation" && !query.state.data ? 2_000 : false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!artifactDetail) return;
    queryClient.setQueryData<ArtifactHistoryItem[]>(historyQueryKey, (current = []) =>
      upsertArtifactHistory(current, artifactDetail, { insertIfMissing: false }),
    );
    if (artifactDetail !== artifactQuery.data) {
      queryClient.setQueryData(
        artifactWorkbenchQueryKeys.detail(
          input.workspaceId,
          input.conversationId,
          artifactDetail.id,
        ),
        artifactDetail,
      );
    }
  }, [
    artifactDetail,
    artifactQuery.data,
    historyQueryKey,
    input.conversationId,
    input.workspaceId,
    queryClient,
  ]);

  const artifactIsActive =
    artifactDetail !== undefined &&
    artifactDetail.generationState !== "ready" &&
    (artifactDetail.generationState !== "failed" || artifactDetail.kind === "presentation");
  useArtifactLiveUpdates({
    artifactId: input.selectedArtifactId,
    conversationId: input.conversationId,
    enabled:
      artifactIsActive &&
      (input.selectedArtifactId === null ||
        !input.unavailableArtifactIds.has(input.selectedArtifactId)),
    generationAttemptId: artifactDetail?.generationAttemptId ?? null,
    kind: artifactDetail?.kind ?? null,
    workspaceId: input.workspaceId,
  });

  const cacheDetail = useCallback(
    (detail: ArtifactDetail, options: { insertIntoHistory?: boolean } = {}) => {
      queryClient.setQueryData<ArtifactDetail>(
        artifactWorkbenchQueryKeys.detail(input.workspaceId, input.conversationId, detail.id),
        (current) => newestArtifactDetail(current, detail, detail.id) ?? detail,
      );
      queryClient.setQueryData<ArtifactHistoryItem[]>(historyQueryKey, (current = []) =>
        upsertArtifactHistory(current, detail, {
          insertIfMissing: options.insertIntoHistory ?? false,
        }),
      );
    },
    [historyQueryKey, input.conversationId, input.workspaceId, queryClient],
  );

  const dismissProposal = useCallback(
    (artifactId: string, runId: string) => {
      const queryKey = artifactWorkbenchQueryKeys.proposal(
        input.workspaceId,
        input.conversationId,
        artifactId,
      );
      queryClient.setQueryData<ArtifactEditProposal | null>(queryKey, (current) =>
        current?.runId === runId ? null : current,
      );
      void dismissArtifactProposal({
        artifactId,
        conversationId: input.conversationId,
        runId,
        workspaceId: input.workspaceId,
      }).catch(() => {
        void queryClient.invalidateQueries({ queryKey });
      });
    },
    [input.conversationId, input.workspaceId, queryClient],
  );

  return {
    artifactDetail,
    artifactQuery,
    cacheDetail,
    currentRevisionId,
    dismissProposal,
    historyQuery,
    historyQueryKey,
    proposalQuery,
    proposalQueryKey,
    queryClient,
    visibleArtifactHistory,
  };
}
