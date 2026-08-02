"use client";

import { useQueryClient } from "@tanstack/react-query";
import { startTransition, useEffect } from "react";
import type { ArtifactDetail, ArtifactDraftEvent } from "@/features/artifacts/contract";
import { teachingDocumentDraftMarkdown } from "@/features/artifacts/documents/realtime";
import type { ArtifactKind } from "@/features/artifacts/types";
import { artifactWorkbenchQueryKeys } from "@/features/artifacts/workbench-client";
import { artifactClientModule } from "./artifactClientModules";

const ARTIFACT_STREAM_GAP = "artifact_stream_gap";

export function useArtifactLiveUpdates(input: {
  artifactId: string | null;
  conversationId: string;
  enabled: boolean;
  generationAttemptId: string | null;
  kind: ArtifactKind | null;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!input.enabled || !input.artifactId || !input.generationAttemptId || !input.kind) {
      return;
    }
    const artifactId = input.artifactId;
    const generationAttemptId = input.generationAttemptId;
    const expectedKind = input.kind;
    const controller = new AbortController();
    const detailKey = artifactWorkbenchQueryKeys.detail(
      input.workspaceId,
      input.conversationId,
      artifactId,
    );
    const initialDetail = queryClient.getQueryData<ArtifactDetail>(detailKey);
    let lastSequence = initialDetail?.generationSequence ?? 0;
    let expectedTextOffset =
      initialDetail?.kind === "teaching_document"
        ? teachingDocumentDraftMarkdown(initialDetail.draft).length
        : 0;
    let pendingEvents: ArtifactDraftEvent[] = [];
    let frame: number | null = null;

    const invalidateFacts = () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: artifactWorkbenchQueryKeys.detail(
            input.workspaceId,
            input.conversationId,
            artifactId,
          ),
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: artifactWorkbenchQueryKeys.history(input.workspaceId, input.conversationId),
          refetchType: "active",
        }),
      ]);

    const waitToRetry = (delay: number) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          window.clearTimeout(timeout);
          controller.signal.removeEventListener("abort", finish);
          resolve();
        };
        const timeout = window.setTimeout(finish, delay);
        controller.signal.addEventListener("abort", finish, { once: true });
      });

    const flushEvents = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      const events = pendingEvents;
      pendingEvents = [];
      if (events.length === 0) return;
      startTransition(() => {
        queryClient.setQueryData<ArtifactDetail>(detailKey, (current) => {
          let next = current;
          for (const event of events) {
            if (!next || next.kind !== event.kind) continue;
            if (
              next.generationState === "ready" ||
              (next.generationState === "failed" && next.kind !== "presentation") ||
              next.generationState === "cancelled"
            )
              continue;
            if (event.kind === "teaching_document" && next.kind === "teaching_document") {
              const module = artifactClientModule("teaching_document");
              const parsed = module.detailSchema.safeParse(next);
              next = parsed.success ? module.applyDraftEvent(parsed.data, event) : next;
              continue;
            }
            if (event.kind === "mind_map" && next.kind === "mind_map") {
              const module = artifactClientModule("mind_map");
              const parsed = module.detailSchema.safeParse(next);
              next = parsed.success ? module.applyDraftEvent(parsed.data, event) : next;
              continue;
            }
            if (event.kind === "presentation" && next.kind === "presentation") {
              const module = artifactClientModule("presentation");
              const parsed = module.detailSchema.safeParse(next);
              next = parsed.success ? module.applyDraftEvent(parsed.data, event) : next;
            }
          }
          return next;
        });
      });
    };

    const scheduleFlush = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        flushEvents();
      });
    };

    const discardPendingEvents = () => {
      pendingEvents = [];
      if (frame === null) return;
      window.cancelAnimationFrame(frame);
      frame = null;
    };

    const resetResumeCursorFromCache = () => {
      const current = queryClient.getQueryData<ArtifactDetail>(detailKey);
      lastSequence = current?.generationSequence ?? 0;
      expectedTextOffset =
        current?.kind === "teaching_document"
          ? teachingDocumentDraftMarkdown(current.draft).length
          : 0;
    };

    const applyEvent = (line: string) => {
      if (!line.trim()) return;
      const rawEvent: unknown = JSON.parse(line);
      const event =
        expectedKind === "teaching_document"
          ? artifactClientModule("teaching_document").draftEventSchema.parse(rawEvent)
          : expectedKind === "mind_map"
            ? artifactClientModule("mind_map").draftEventSchema.parse(rawEvent)
            : expectedKind === "presentation"
              ? artifactClientModule("presentation").draftEventSchema.parse(rawEvent)
              : null;
      if (!event) throw new Error("artifact_stream_kind_unsupported");
      if (event.kind !== expectedKind) throw new Error("artifact_stream_kind_mismatch");
      if (event.sequence <= lastSequence) return;
      if (event.kind === "teaching_document" && event.event === "text_delta") {
        if (event.startOffset !== expectedTextOffset) throw new Error(ARTIFACT_STREAM_GAP);
        expectedTextOffset += event.delta.length;
      }
      lastSequence = event.sequence;
      pendingEvents.push(event);
      scheduleFlush();
      if (
        event.kind === "teaching_document" &&
        (event.event === "completed" ||
          event.event === "partial_completed" ||
          event.event === "failed")
      ) {
        flushEvents();
        void invalidateFacts();
      }
    };

    const consume = async () => {
      let retryDelay = 250;
      while (!controller.signal.aborted) {
        try {
          const query = new URLSearchParams({
            attemptId: generationAttemptId,
            afterSequence: String(lastSequence),
            conversationId: input.conversationId,
            workspaceId: input.workspaceId,
          });
          const response = await fetch(`/api/artifacts/${artifactId}/stream?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.status === 204 || response.status === 409) {
            await invalidateFacts();
            return;
          }
          if (!response.ok || !response.body) throw new Error("artifact_stream_unavailable");

          retryDelay = 250;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) applyEvent(line);
            if (done) break;
          }
          applyEvent(pending);
          flushEvents();
          if (!controller.signal.aborted) await invalidateFacts();
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof Error && error.message === ARTIFACT_STREAM_GAP) {
            discardPendingEvents();
            await invalidateFacts();
            resetResumeCursorFromCache();
          }
          await waitToRetry(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 5_000);
        }
      }
    };
    void consume();
    return () => {
      controller.abort();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [
    input.artifactId,
    input.conversationId,
    input.enabled,
    input.generationAttemptId,
    input.kind,
    input.workspaceId,
    queryClient,
  ]);
}
