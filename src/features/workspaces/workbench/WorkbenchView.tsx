"use client";

import { useMutation } from "@tanstack/react-query";
import { animate } from "motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { AgentSurfaceContext } from "@/features/agents/surface-context";
import type { ThreadTitleUpdate } from "@/features/agents/thread-events";
import type { ArtifactDetail, ArtifactSelection } from "@/features/artifacts/contract";
import { artifactKindForInteractionSelection } from "@/features/artifacts/contract";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import {
  ArtifactDetailError,
  addArtifactToSources,
  artifactHasRenderableContent,
  artifactWorkbenchQueryKeys,
  deleteArtifact,
  fetchArtifactDetail,
} from "@/features/artifacts/workbench-client";
import type { Source } from "@/features/sources/types";
import {
  type ArtifactSourceTransitionContextValue,
  ArtifactSourceTransitionProvider,
} from "./ArtifactSourceTransitionContext";
import { ArtifactWorkbenchPanelLayout } from "./ArtifactWorkbenchPanelLayout";
import { ArtifactWorkspaceView } from "./ArtifactWorkspaceView";
import { moveArtifactIntoSources } from "./artifactSourceMembership";
import {
  artifactKindForSelection,
  artifactSelectionForTool,
  artifactSelectionReducer,
  artifactWorkbenchLayoutMode,
  artifactWorkspacePhase,
  initialArtifactSelectionState,
  selectedArtifactIdForState,
  studioToolForArtifactKind,
} from "./artifactWorkbench";
import { ChatPanelView } from "./ChatPanelView";
import { StudioPanelView } from "./StudioPanelView";
import { studioToolTone } from "./studioTools";
import type {
  WorkspaceConversationNavigationItem,
  WorkspaceSettingsFormAction,
  WorkspaceThreadDeleteFormAction,
  WorkspaceThreadRenameFormAction,
  WorkspaceWorkbenchFixture,
} from "./types";
import { useArtifactWorkbenchData } from "./useArtifactWorkbenchData";
import type {
  ArtifactStreamEvent,
  ComposerSuggestion,
  UserMessageSurfaceSnapshot,
} from "./WorkbenchChatRuntime";
import { WorkbenchPanelLayout } from "./WorkbenchPanelLayout";
import { WorkspaceHeaderView } from "./WorkspaceHeaderView";

export function startWorkbenchViewTransition(update: () => void) {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  let callbackStarted = false;
  try {
    const transition = document.startViewTransition(() => {
      callbackStarted = true;
      flushSync(update);
    });
    // Chrome rejects each lifecycle promise when a newer transition, navigation,
    // or HMR update supersedes this one. Consume all three to keep an expected
    // visual cancellation out of the application error boundary.
    void Promise.allSettled([transition.ready, transition.updateCallbackDone, transition.finished]);
  } catch (error) {
    if (callbackStarted) throw error;
    update();
  }
}

function artifactMembershipElement(artifactId: string, destination: "history" | "sources") {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-artifact-membership-id]")).find(
    (element) =>
      element.dataset.artifactMembershipId === artifactId &&
      element.dataset.artifactMembershipDestination === destination,
  );
}

function waitForArtifactMembershipElement(artifactId: string, destination: "history" | "sources") {
  const existing = artifactMembershipElement(artifactId, destination);
  if (existing) return Promise.resolve(existing);
  return new Promise<HTMLElement | null>((resolve) => {
    const observer = new MutationObserver(() => {
      const element = artifactMembershipElement(artifactId, destination);
      if (element) finish(element);
    });
    const timeout = window.setTimeout(() => finish(null), 800);
    let settled = false;
    function finish(element: HTMLElement | null) {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(element);
    }
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function animateArtifactMembershipMove(
  artifactId: string,
  destination: "history" | "sources",
  update: () => void,
) {
  const departure = artifactMembershipElement(
    artifactId,
    destination === "sources" ? "history" : "sources",
  );
  const workspaceRoot = departure?.closest<HTMLElement>("[data-workspace-theme]");
  if (!departure || !workspaceRoot) {
    flushSync(update);
    return;
  }
  const departureRect = departure.getBoundingClientRect();
  const flightLayer = document.createElement("div");
  flightLayer.setAttribute("aria-hidden", "true");
  flightLayer.dataset.workspaceStyle = workspaceRoot.dataset.workspaceStyle ?? "mist-zinc";
  flightLayer.dataset.workspaceTheme = workspaceRoot.dataset.workspaceTheme ?? "mist-zinc";
  Object.assign(flightLayer.style, {
    inset: "0",
    isolation: "isolate",
    overflow: "visible",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "2147483000",
  });
  const ghost = departure.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-artifact-membership-id");
  ghost.removeAttribute("data-artifact-membership-destination");
  ghost.setAttribute("aria-hidden", "true");
  ghost.querySelectorAll<HTMLElement>("a, button, [tabindex]").forEach((element) => {
    element.tabIndex = -1;
  });
  Object.assign(ghost.style, {
    height: `${departureRect.height}px`,
    left: `${departureRect.left}px`,
    margin: "0",
    pointerEvents: "none",
    position: "fixed",
    top: `${departureRect.top}px`,
    transform: "translateZ(0)",
    transformOrigin: "center",
    width: `${departureRect.width}px`,
    willChange: "transform, opacity",
  });
  flightLayer.append(ghost);
  document.body.append(flightLayer);
  try {
    flushSync(update);
    const arrival = await waitForArtifactMembershipElement(artifactId, destination);
    if (!arrival) return;
    const arrivalRect = arrival.getBoundingClientRect();
    const deltaX = arrivalRect.left - departureRect.left;
    const deltaY = arrivalRect.top - departureRect.top;
    arrival.style.opacity = "0";
    const animation = animate(0, 1, {
      bounce: 0.03,
      onUpdate: (progress: number) => {
        const controlX = deltaX * 0.5;
        const controlY = Math.min(-64, deltaY * 0.25 - 52);
        const remaining = 1 - progress;
        const x = 2 * remaining * progress * controlX + progress * progress * deltaX;
        const y = 2 * remaining * progress * controlY + progress * progress * deltaY;
        ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      },
      type: "spring",
      visualDuration: 0.8,
    });
    await animation;
    arrival.style.opacity = "";
  } finally {
    flightLayer.remove();
    artifactMembershipElement(artifactId, destination)?.style.removeProperty("opacity");
  }
}

export function WorkbenchView({
  fixture,
  canPublishArtifacts = true,
  initialArtifact,
  initialArtifactCanManage = true,
  initialArtifactHistory,
  accountMenu,
  conversationId,
  conversations,
  conversationNextCursor = null,
  deleteThreadAction,
  initialMessagesNextCursor = null,
  newConversationId,
  onThreadTitle,
  renameThreadAction,
  shareControl = null,
  canManageSettings = true,
  settingsAction,
  settingsControl,
  sourcesPanel,
  workspaceId,
  workspaceHref,
  workspaceSlug,
}: {
  fixture: WorkspaceWorkbenchFixture;
  canPublishArtifacts?: boolean;
  initialArtifact: ArtifactDetail | null;
  initialArtifactCanManage?: boolean;
  initialArtifactHistory: readonly ArtifactHistoryItem[];
  accountMenu: ReactNode;
  conversationId: string;
  conversations: readonly WorkspaceConversationNavigationItem[];
  conversationNextCursor?: string | null;
  deleteThreadAction: WorkspaceThreadDeleteFormAction;
  initialMessagesNextCursor?: string | null;
  newConversationId: string;
  onThreadTitle: (update: ThreadTitleUpdate) => void;
  renameThreadAction: WorkspaceThreadRenameFormAction;
  shareControl?: ReactNode;
  canManageSettings?: boolean;
  settingsAction: WorkspaceSettingsFormAction;
  settingsControl: ReactNode;
  sourcesPanel: ReactNode;
  workspaceId: string;
  workspaceHref: string;
  workspaceSlug: string | null;
}) {
  const t = useTranslations("Workbench");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [composerSuggestion, setComposerSuggestion] = useState<ComposerSuggestion | null>(null);
  const [membershipTransitionArtifactId, setMembershipTransitionArtifactId] = useState<
    string | null
  >(null);
  const [membershipAnnouncement, setMembershipAnnouncement] = useState({
    message: "",
    sequence: 0,
  });
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [artifactInteractionSelection, setArtifactInteractionSelection] =
    useState<ArtifactSelection | null>(null);
  const [artifactProposal, setArtifactProposal] = useState<ArtifactEditProposal | null>(null);
  const pendingCreationSourceUserMessageId = useRef<string | null>(null);
  const consumeComposerSuggestion = useCallback((id: number) => {
    setComposerSuggestion((current) => (current?.id === id ? null : current));
  }, []);
  const [artifactSelection, dispatchArtifactSelection] = useReducer(
    artifactSelectionReducer,
    initialArtifactSelectionState,
  );
  const [unavailableArtifactIds, setUnavailableArtifactIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const urlArtifactId = searchParams?.get("artifact") ?? null;
  const selectedArtifactId = selectedArtifactIdForState(artifactSelection, urlArtifactId);
  const conversationHref = `${workspaceHref}?conversation=${conversationId}`;
  const artifactHref = useCallback(
    (artifactId: string) => `${conversationHref}&artifact=${artifactId}`,
    [conversationHref],
  );
  useEffect(() => {
    dispatchArtifactSelection({ artifactId: urlArtifactId, type: "urlChanged" });
  }, [urlArtifactId]);
  const {
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
  } = useArtifactWorkbenchData({
    conversationId,
    initialArtifact,
    initialArtifactHistory,
    selectedArtifactId,
    unavailableArtifactIds,
    workspaceId,
  });
  const runArtifactSourceTransition = useCallback<ArtifactSourceTransitionContextValue["run"]>(
    async (artifactId, destination, update) => {
      const finish = () => {
        setMembershipTransitionArtifactId((current) => (current === artifactId ? null : current));
        artifactMembershipElement(artifactId, destination)?.focus({ preventScroll: true });
        setMembershipAnnouncement((current) => ({
          message:
            destination === "sources" ? t("artifactMovedToSources") : t("artifactMovedToHistory"),
          sequence: current.sequence + 1,
        }));
      };
      if (
        typeof document === "undefined" ||
        typeof window === "undefined" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        flushSync(update);
        finish();
        return;
      }
      flushSync(() => setMembershipTransitionArtifactId(artifactId));
      let didUpdate = false;
      const applyUpdate = () => {
        if (didUpdate) return;
        didUpdate = true;
        update();
      };
      try {
        await animateArtifactMembershipMove(artifactId, destination, applyUpdate);
      } catch {
        flushSync(applyUpdate);
      } finally {
        finish();
      }
    },
    [t],
  );
  const artifactSourceTransition = useMemo<ArtifactSourceTransitionContextValue>(
    () => ({
      activeArtifactId: membershipTransitionArtifactId,
      open: async ({ artifactId, conversationId: targetConversationId, href }) => {
        if (membershipTransitionArtifactId) return;
        setMembershipTransitionArtifactId(artifactId);
        try {
          await queryClient.fetchQuery({
            queryFn: () =>
              fetchArtifactDetail({
                artifactId,
                conversationId: targetConversationId,
                workspaceId,
              }),
            queryKey: artifactWorkbenchQueryKeys.detail(
              workspaceId,
              targetConversationId,
              artifactId,
            ),
            staleTime: 30_000,
          });
          pendingCreationSourceUserMessageId.current = null;
          if (targetConversationId === conversationId) {
            startWorkbenchViewTransition(() => {
              dispatchArtifactSelection({ artifactId, type: "select" });
            });
          }
          router.push(href, { scroll: false });
        } finally {
          setMembershipTransitionArtifactId((current) => (current === artifactId ? null : current));
        }
      },
      prefetch: async ({ artifactId, conversationId: targetConversationId }) => {
        await queryClient.prefetchQuery({
          queryFn: () =>
            fetchArtifactDetail({
              artifactId,
              conversationId: targetConversationId,
              workspaceId,
            }),
          queryKey: artifactWorkbenchQueryKeys.detail(
            workspaceId,
            targetConversationId,
            artifactId,
          ),
          staleTime: 30_000,
        });
      },
      run: runArtifactSourceTransition,
    }),
    [
      conversationId,
      membershipTransitionArtifactId,
      queryClient,
      router,
      runArtifactSourceTransition,
      workspaceId,
    ],
  );
  const updateArtifactDetail = useCallback(
    (detail: ArtifactDetail) => {
      cacheDetail(detail);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "sources"] }),
      ]);
    },
    [cacheDetail, historyQueryKey, queryClient, workspaceId],
  );
  useEffect(() => {
    setArtifactInteractionSelection((current) =>
      current && current.revisionId === currentRevisionId ? current : null,
    );
    setArtifactProposal((current) =>
      current &&
      current.artifactId === selectedArtifactId &&
      current.baseRevisionId === currentRevisionId
        ? current
        : null,
    );
  }, [currentRevisionId, selectedArtifactId]);
  useEffect(() => {
    if (!proposalQuery.isSuccess) return;
    const proposal = proposalQuery.data;
    const isCurrent =
      proposal?.artifactId === selectedArtifactId && proposal.baseRevisionId === currentRevisionId;
    setArtifactProposal(isCurrent ? proposal : null);
  }, [currentRevisionId, proposalQuery.data, proposalQuery.isSuccess, selectedArtifactId]);
  const addArtifactSourceMutation = useMutation({
    mutationFn: (artifactId: string) =>
      addArtifactToSources({ artifactId, conversationId, workspaceId }),
    onSuccess: async (source, artifactId) => {
      await runArtifactSourceTransition(artifactId, "sources", () => {
        const sourcesQueryKey = ["workspace", workspaceId, "sources"] as const;
        const currentHistory =
          queryClient.getQueryData<ArtifactHistoryItem[]>(historyQueryKey) ?? [];
        const currentSources = queryClient.getQueryData<Source[]>(sourcesQueryKey) ?? [];
        const moved = moveArtifactIntoSources(currentHistory, currentSources, source);
        queryClient.setQueryData(historyQueryKey, moved.history);
        queryClient.setQueryData(sourcesQueryKey, moved.sources);
      });
    },
  });
  const deleteArtifactMutation = useMutation({
    mutationFn: (artifactId: string) => deleteArtifact({ artifactId, conversationId, workspaceId }),
    onMutate: async (artifactId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: historyQueryKey }),
        queryClient.cancelQueries({
          queryKey: artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId),
        }),
      ]);
    },
    onSuccess: async (_value, artifactId) => {
      setUnavailableArtifactIds((current) => new Set(current).add(artifactId));
      queryClient.setQueryData<ArtifactHistoryItem[]>(historyQueryKey, (current = []) =>
        current.filter((item) => item.id !== artifactId),
      );
      queryClient.removeQueries({
        queryKey: artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId),
      });
      if (selectedArtifactId === artifactId) {
        startWorkbenchViewTransition(() => {
          dispatchArtifactSelection({ type: "openStudio" });
        });
        router.replace(conversationHref, { scroll: false });
      }
      await queryClient.invalidateQueries({ queryKey: historyQueryKey });
    },
  });
  useEffect(() => {
    if (
      !selectedArtifactId ||
      !(artifactQuery.error instanceof ArtifactDetailError) ||
      artifactQuery.error.code !== "not_found"
    ) {
      return;
    }
    setUnavailableArtifactIds((current) => new Set(current).add(selectedArtifactId));
    startWorkbenchViewTransition(() => {
      dispatchArtifactSelection({ artifactId: selectedArtifactId, type: "unavailable" });
    });
    router.replace(conversationHref, { scroll: false });
  }, [artifactQuery.error, conversationHref, router, selectedArtifactId]);
  const handleArtifactEvent = useCallback(
    (event: ArtifactStreamEvent) => {
      if (unavailableArtifactIds.has(event.detail.id)) return;
      const expectedSourceUserMessageId = pendingCreationSourceUserMessageId.current;
      const isExpectedCreation =
        artifactSelection.mode === "starting" &&
        artifactKindForSelection(artifactSelection) === event.detail.kind &&
        Boolean(expectedSourceUserMessageId) &&
        event.sourceUserMessageId === expectedSourceUserMessageId;
      const existsInServerHistory = initialArtifactHistory.some(
        (artifact) => artifact.id === event.detail.id,
      );
      if (event.replayedFromHistory && !isExpectedCreation && !existsInServerHistory) {
        void fetchArtifactDetail({
          artifactId: event.detail.id,
          conversationId,
          workspaceId,
        })
          .then(cacheDetail)
          .catch((error: unknown) => {
            if (!(error instanceof ArtifactDetailError) || error.code !== "not_found") return;
            setUnavailableArtifactIds((current) => new Set(current).add(event.detail.id));
          });
        return;
      }
      cacheDetail(event.detail, { insertIntoHistory: true });
      if (!isExpectedCreation) return;
      pendingCreationSourceUserMessageId.current = null;
      startWorkbenchViewTransition(() => {
        dispatchArtifactSelection({ artifactId: event.detail.id, type: "select" });
      });
      router.replace(artifactHref(event.detail.id), { scroll: false });
    },
    [
      artifactHref,
      artifactSelection,
      cacheDetail,
      conversationId,
      initialArtifactHistory,
      router,
      unavailableArtifactIds,
      workspaceId,
    ],
  );
  const openArtifactFromMessage = useCallback(
    async (artifactId: string) => {
      // A direct user selection always wins over an in-flight creation event.
      // Disarm auto-open before prefetching so another Artifact from the same
      // assistant turn cannot replace the card the user just chose.
      pendingCreationSourceUserMessageId.current = null;
      try {
        await queryClient.fetchQuery({
          queryFn: () => fetchArtifactDetail({ artifactId, conversationId, workspaceId }),
          queryKey: artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId),
          staleTime: 0,
        });
        setUnavailableArtifactIds((current) => {
          if (!current.has(artifactId)) return current;
          const next = new Set(current);
          next.delete(artifactId);
          return next;
        });
        startWorkbenchViewTransition(() => {
          dispatchArtifactSelection({ artifactId, type: "select" });
        });
        router.push(artifactHref(artifactId), { scroll: false });
      } catch (error) {
        if (error instanceof ArtifactDetailError && error.code === "not_found") {
          setUnavailableArtifactIds((current) => new Set(current).add(artifactId));
          dispatchArtifactSelection({ artifactId, type: "unavailable" });
        }
      }
    },
    [artifactHref, conversationId, queryClient, router, workspaceId],
  );
  const selectedArtifactKind =
    artifactDetail?.kind ??
    historyQuery.data.find((item) => item.id === selectedArtifactId)?.kind ??
    null;
  const activeArtifactKind =
    artifactSelection.mode === "starting"
      ? artifactKindForSelection(artifactSelection)
      : selectedArtifactKind;
  const activeStudioTool =
    artifactSelection.mode === "starting"
      ? artifactSelection.toolId
      : activeArtifactKind
        ? studioToolForArtifactKind(activeArtifactKind)
        : null;
  const activeStudioTone = activeStudioTool ? studioToolTone(activeStudioTool) : "neutral";
  const isArtifactWorkspaceOpen = activeArtifactKind !== null;
  const activeArtifactInteractionSelection =
    artifactDetail &&
    artifactInteractionSelection &&
    artifactInteractionSelection.revisionId === artifactDetail.artifact?.currentRevision.id &&
    artifactKindForInteractionSelection(artifactInteractionSelection) === artifactDetail.kind
      ? artifactInteractionSelection
      : null;
  const surfaceContext: AgentSurfaceContext =
    artifactSelection.mode === "starting" && activeArtifactKind
      ? { kind: activeArtifactKind, type: "artifact_start" }
      : selectedArtifactId
        ? {
            artifactId: selectedArtifactId,
            ...(activeArtifactInteractionSelection
              ? { focus: activeArtifactInteractionSelection }
              : {}),
            revisionId: artifactDetail?.artifact?.currentRevision.id ?? null,
            type: "artifact_detail",
          }
        : { type: "studio" };
  const artifactLayoutMode = artifactWorkbenchLayoutMode({
    generationState: artifactDetail?.generationState,
    hasRenderableContent: artifactHasRenderableContent(artifactDetail),
  });
  const artifactContext = useMemo(
    () =>
      artifactDetail?.generationState === "ready"
        ? artifactDetail.kind === "presentation"
          ? {
              kind: artifactDetail.kind,
              pageCount: artifactDetail.artifact.currentRevision.content.pageCount,
              title: artifactDetail.title,
            }
          : { kind: artifactDetail.kind, title: artifactDetail.title }
        : undefined,
    [artifactDetail],
  );
  const chat = (
    <ChatPanelView
      {...fixture.chat}
      artifactHistory={visibleArtifactHistory}
      conversationId={conversationId}
      initialMessagesNextCursor={initialMessagesNextCursor}
      onThreadTitle={onThreadTitle}
      workspaceId={workspaceId}
      surfaceContext={surfaceContext}
      onUserMessageCreated={(snapshot: UserMessageSurfaceSnapshot) => {
        pendingCreationSourceUserMessageId.current =
          snapshot.surface.type === "artifact_start" ? snapshot.id : null;
      }}
      composerSuggestion={composerSuggestion}
      onComposerSuggestionConsumed={consumeComposerSuggestion}
      onArtifactEvent={handleArtifactEvent}
      onOpenArtifact={(artifactId) => void openArtifactFromMessage(artifactId)}
      unavailableArtifactIds={unavailableArtifactIds}
      artifactContext={artifactContext}
      artifactSelection={activeArtifactInteractionSelection}
      onClearArtifactSelection={() => setArtifactInteractionSelection(null)}
      composerFocusRequest={composerFocusRequest}
      onArtifactProposal={(proposal) => {
        if (
          proposal.artifactId === selectedArtifactId &&
          proposal.baseRevisionId === currentRevisionId
        ) {
          setArtifactProposal(proposal);
          queryClient.setQueryData(proposalQueryKey, proposal);
          setArtifactInteractionSelection(null);
        }
      }}
    />
  );
  return (
    <ArtifactSourceTransitionProvider value={artifactSourceTransition}>
      <div
        data-workspace-style="mist-zinc"
        data-workspace-theme="mist-zinc"
        data-studio-tone={activeStudioTone}
        className="workspace-theme-root relative flex h-screen select-none flex-col overflow-hidden bg-[var(--workspace-bg-base)]"
      >
        <p
          key={membershipAnnouncement.sequence}
          className="sr-only"
          role="status"
          aria-live="polite"
        >
          {membershipAnnouncement.message}
        </p>
        <a href="#main-content" className="skip-link">
          {t("skipToContent")}
        </a>
        <div className="workspace-workbench-background pointer-events-none absolute inset-0" />
        <WorkspaceHeaderView
          {...fixture.workspace}
          accountMenu={accountMenu}
          canManageSettings={canManageSettings}
          conversationId={conversationId}
          conversations={conversations}
          conversationNextCursor={conversationNextCursor}
          deleteThreadAction={deleteThreadAction}
          newConversationId={newConversationId}
          renameThreadAction={renameThreadAction}
          settingsAction={settingsAction}
          settingsControl={settingsControl}
          shareControl={shareControl}
          workspaceId={workspaceId}
          workspaceHref={workspaceHref}
          workspaceSlug={workspaceSlug}
        />
        <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1">
          {isArtifactWorkspaceOpen ? (
            <ArtifactWorkbenchPanelLayout
              layoutMode={artifactLayoutMode}
              artifact={
                <ArtifactWorkspaceView
                  detail={artifactDetail ?? null}
                  conversationId={conversationId}
                  kind={activeArtifactKind}
                  onDetailUpdated={updateArtifactDetail}
                  onBack={() => {
                    pendingCreationSourceUserMessageId.current = null;
                    startWorkbenchViewTransition(() => {
                      dispatchArtifactSelection({ type: "openStudio" });
                    });
                    router.replace(conversationHref, { scroll: false });
                  }}
                  onSuggestion={(text) =>
                    setComposerSuggestion((current) => ({ id: (current?.id ?? 0) + 1, text }))
                  }
                  phase={artifactWorkspacePhase(artifactDetail?.generationState)}
                  proposal={artifactProposal}
                  readOnly={!initialArtifactCanManage}
                  selection={artifactInteractionSelection}
                  onSelectionChange={setArtifactInteractionSelection}
                  onProposalDismiss={() => {
                    setArtifactProposal(null);
                    if (selectedArtifactId && artifactProposal) {
                      dismissProposal(selectedArtifactId, artifactProposal.runId);
                    }
                  }}
                  onProposalRetry={(request) => {
                    setArtifactProposal(null);
                    if (selectedArtifactId && artifactProposal) {
                      dismissProposal(selectedArtifactId, artifactProposal.runId);
                    }
                    setComposerSuggestion((current) => ({
                      id: (current?.id ?? 0) + 1,
                      text: request,
                    }));
                    setComposerFocusRequest((current) => current + 1);
                  }}
                  onRequestAssistant={() => setComposerFocusRequest((current) => current + 1)}
                  workspaceId={workspaceId}
                />
              }
              assistant={chat}
              disclaimer={fixture.disclaimer}
              sources={sourcesPanel}
            />
          ) : (
            <WorkbenchPanelLayout
              disclaimer={fixture.disclaimer}
              studio={(studioControls) => (
                <StudioPanelView
                  {...fixture.studio}
                  artifactHistory={visibleArtifactHistory}
                  artifactHistoryError={historyQuery.isError}
                  artifactHref={artifactHref}
                  isRefreshingHistory={historyQuery.isFetching}
                  onRefreshHistory={() => void historyQuery.refetch()}
                  onDeleteArtifact={(artifactId) => deleteArtifactMutation.mutateAsync(artifactId)}
                  {...(canPublishArtifacts
                    ? {
                        onAddArtifactSource: async (artifactId: string) => {
                          await addArtifactSourceMutation.mutateAsync(artifactId);
                        },
                      }
                    : {})}
                  addingArtifactSourceId={
                    addArtifactSourceMutation.isPending ? addArtifactSourceMutation.variables : null
                  }
                  artifactSourceAddError={addArtifactSourceMutation.isError}
                  onOpenArtifact={(artifactId) => {
                    pendingCreationSourceUserMessageId.current = null;
                    startWorkbenchViewTransition(() =>
                      dispatchArtifactSelection({ artifactId, type: "select" }),
                    );
                    router.push(artifactHref(artifactId), { scroll: false });
                  }}
                  onSelectTool={(toolId) => {
                    const selection = artifactSelectionForTool(toolId);
                    if (!selection) return;
                    pendingCreationSourceUserMessageId.current = null;
                    startWorkbenchViewTransition(() =>
                      dispatchArtifactSelection({ toolId: selection.toolId, type: "start" }),
                    );
                  }}
                  selectedArtifactId={selectedArtifactId}
                  collapsed={studioControls.collapsed}
                  historyFocusRequest={studioControls.historyFocusRequest}
                  onExpand={studioControls.expand}
                  onShowHistory={studioControls.showHistory}
                />
              )}
              chat={chat}
              sources={sourcesPanel}
              workspaceId={workspaceId}
            />
          )}
        </main>
      </div>
    </ArtifactSourceTransitionProvider>
  );
}
