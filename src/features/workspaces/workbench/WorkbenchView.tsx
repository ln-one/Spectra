"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
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
import type { KnowledgeCitationEvidence } from "@/features/agents/knowledge-citation-contract";
import type { AgentSurfaceContext } from "@/features/agents/surface-context";
import type { ThreadTitleUpdate } from "@/features/agents/thread-events";
import type { ArtifactDetail, ArtifactSelection } from "@/features/artifacts/contract";
import {
  artifactHistoryItemFromDetail,
  artifactKindForInteractionSelection,
} from "@/features/artifacts/contract";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import {
  ArtifactDetailError,
  addArtifactToSources,
  artifactHasRenderableContent,
  artifactWorkbenchQueryKeys,
  deleteArtifact,
  fetchArtifactDetail,
  retryArtifactGeneration,
} from "@/features/artifacts/workbench-client";
import {
  type KnowledgeNetworkGraphCitationFocus,
  type KnowledgeNetworkGraphFocusRequest,
  knowledgeNetworkSelectedNodeDetails,
} from "@/features/knowledge-network/KnowledgeNetworkGraphView";
import {
  KnowledgeNetworkNodeInspector,
  type KnowledgeNetworkSelectedNode,
} from "@/features/knowledge-network/KnowledgeNetworkNodeInspector";
import { KnowledgeNetworkSourcesPanel } from "@/features/knowledge-network/KnowledgeNetworkWorkbench";
import { prepareKnowledgeNetworkGraphPlan } from "@/features/knowledge-network/knowledge-network-plan";
import { mergeKnowledgeNetworkCitation } from "@/features/knowledge-network/live-trace";
import {
  directKnowledgeNetworkSourceEntries,
  type KnowledgeNetworkLabels,
  type KnowledgeNetworkNodeSelectionLabels,
  type KnowledgeNetworkTrace,
  type KnowledgeNetworkWorkspaceNavigationContext,
  type KnowledgeNetworkWorkspaceNavigationTarget,
  type KnowledgeNetworkWorkspaceReturnView,
  workspaceNavigationTarget,
  ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS,
} from "@/features/knowledge-network/model";
import type { Source } from "@/features/sources/types";
import {
  type ArtifactSourceTransitionContextValue,
  ArtifactSourceTransitionProvider,
} from "./ArtifactSourceTransitionContext";
import {
  ArtifactWorkbenchPanelLayout,
  useIsMobileArtifactLayout,
} from "./ArtifactWorkbenchPanelLayout";
import { ArtifactWorkspaceView } from "./ArtifactWorkspaceView";
import { moveArtifactIntoSources } from "./artifactSourceMembership";
import {
  type ArtifactCreationToolId,
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
import { KnowledgeNetworkHostProvider } from "./KnowledgeNetworkHostContext";
import { beginKnowledgeNetworkNavigation } from "./knowledge-network-navigation";
import { MobileCreationToolsPage } from "./MobileCreationToolsPage";
import { MobileWorkspaceOverview } from "./MobileWorkspaceOverview";
import { PanelShell } from "./PanelShell";
import { workspaceConversationNavigationQueryKey } from "./read-client";
import { StudioPanelView } from "./StudioPanelView";
import { studioToolTone } from "./studioTools";
import type {
  MobileWorkspaceNavigationItem,
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
import {
  mobilePanelPreferenceKey,
  startWorkbenchPanelTransition,
  WorkbenchPanelLayout,
} from "./WorkbenchPanelLayout";
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

function useResolvedWorkspaceTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    };
    const observer = new MutationObserver(syncTheme);
    syncTheme();
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
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
  knowledgeNetworkTrace = null,
  knowledgeNetworkInitialView = null,
  returnToKnowledgeNetwork,
  workspaceId,
  workspaceHref,
  workspaceSlug,
  workspaceOwnerHandle = "",
  mobileCreationTools = false,
  mobileOverview = false,
  mobileAccount = false,
  mobileAccountData = { handle: "", email: "" },
  mobileAccountPage = null,
  navigationWorkspaces = [],
  sourceCount = 0,
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
  knowledgeNetworkTrace?: KnowledgeNetworkTrace | null;
  knowledgeNetworkInitialView?: KnowledgeNetworkWorkspaceReturnView | null;
  returnToKnowledgeNetwork?: (() => void) | undefined;
  workspaceId: string;
  workspaceHref: string;
  workspaceSlug: string | null;
  workspaceOwnerHandle?: string;
  mobileCreationTools?: boolean;
  mobileOverview?: boolean;
  mobileAccount?: boolean;
  mobileAccountData?: { handle: string; email: string };
  mobileAccountPage?: ReactNode;
  navigationWorkspaces?: readonly MobileWorkspaceNavigationItem[];
  sourceCount?: number;
}) {
  const t = useTranslations("Workbench");
  const isMobileArtifactPreview = useIsMobileArtifactLayout();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = usePrefersReducedMotion();
  const resolvedWorkspaceTheme = useResolvedWorkspaceTheme();
  const [networkTrace, setNetworkTrace] = useState<KnowledgeNetworkTrace | null>(
    knowledgeNetworkTrace,
  );
  const [knowledgeNetworkMode, setKnowledgeNetworkMode] = useState(
    knowledgeNetworkInitialView?.sourceMode === "network",
  );
  const [knowledgeNetworkSelectedId, setKnowledgeNetworkSelectedId] = useState<string | null>(
    knowledgeNetworkInitialView?.selectedNodeId ?? null,
  );
  const [knowledgeNetworkInspectorId, setKnowledgeNetworkInspectorId] = useState<string | null>(
    null,
  );
  const [knowledgeNetworkFocusRequest, setKnowledgeNetworkFocusRequest] =
    useState<KnowledgeNetworkGraphFocusRequest | null>(null);
  const [knowledgeNetworkCitationFocus, setKnowledgeNetworkCitationFocus] =
    useState<KnowledgeNetworkGraphCitationFocus | null>(null);
  const knowledgeNetworkFocusRequestIdRef = useRef(0);
  const knowledgeNetworkInitialViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    setNetworkTrace(knowledgeNetworkTrace);
  }, [knowledgeNetworkTrace]);
  useEffect(() => {
    if (!knowledgeNetworkInitialView || !knowledgeNetworkTrace) return;
    if (knowledgeNetworkInitialView.traceId !== knowledgeNetworkTrace.id) return;
    const viewKey = `${knowledgeNetworkInitialView.traceId}:${knowledgeNetworkInitialView.requestId}`;
    if (knowledgeNetworkInitialViewKeyRef.current === viewKey) return;
    knowledgeNetworkInitialViewKeyRef.current = viewKey;
    setKnowledgeNetworkMode(true);
    setKnowledgeNetworkSelectedId(knowledgeNetworkInitialView.selectedNodeId);
    setKnowledgeNetworkInspectorId(null);
    if (knowledgeNetworkInitialView.citationSourceId) {
      const focus = {
        sourceId: knowledgeNetworkInitialView.citationSourceId,
        requestId: knowledgeNetworkInitialView.requestId,
      };
      setKnowledgeNetworkFocusRequest(focus);
      setKnowledgeNetworkCitationFocus(focus);
    }
  }, [knowledgeNetworkInitialView, knowledgeNetworkTrace]);
  const knowledgeNetworkGraphPlan = useMemo(
    () => (networkTrace ? prepareKnowledgeNetworkGraphPlan(networkTrace) : null),
    [networkTrace],
  );
  const knowledgeNetworkSourceEntries = useMemo(
    () => (networkTrace ? directKnowledgeNetworkSourceEntries(networkTrace) : []),
    [networkTrace],
  );
  const knowledgeNetworkNodeSelectionLabels = useMemo<KnowledgeNetworkNodeSelectionLabels>(
    () => ({
      ...ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS,
      workspace: t("knowledgeNetworkNodeWorkspace"),
      source: t("knowledgeNetworkNodeSource"),
      owner: t("knowledgeNetworkNodeOwner"),
      connections: (count) => t("knowledgeNetworkNodeConnections", { count }),
      sources: (count) => t("knowledgeNetworkNodeSources", { count }),
      chunks: (count) => t("knowledgeNetworkNodeChunks", { count }),
      selectedEvidence: t("knowledgeNetworkNodeSelectedEvidence"),
      close: t("knowledgeNetworkNodeClose"),
      detailsTitle: t("knowledgeNetworkNodeDetailsTitle"),
      sourceListTitle: t("knowledgeNetworkNodeSourceList"),
      currentWorkspace: t("knowledgeNetworkNodeCurrentWorkspace"),
      referencedWorkspace: t("knowledgeNetworkNodeReferencedWorkspace"),
      enterWorkspace: t("knowledgeNetworkNodeEnterWorkspace"),
      enterOwnerWorkspace: t("knowledgeNetworkNodeEnterOwnerWorkspace"),
    }),
    [t],
  );
  const knowledgeNetworkLabels = useMemo<KnowledgeNetworkLabels>(
    () => ({
      studioTitle: t("studioTitle"),
      studioSubtitle: t("studioSubtitle"),
      studioExpand: t("expandStudio"),
      assistantTitle: t("assistantTitle"),
      assistantSubtitle: t("assistantSubtitle"),
      assistantGrounding: t("workspaceRetrieval"),
      sourceTitle: t("knowledgeNetworkNodeSourceList"),
      sourceListSummary: networkTrace
        ? t("knowledgeNetworkStats", {
            workspaceCount: networkTrace.workspaces.length,
            sourceCount: networkTrace.sources.length,
          })
        : t("knowledgeNetworkNodeSourceList"),
      workspaceSourceType: t("knowledgeNetworkNodeWorkspace"),
      workspaceSourceStatus: t("knowledgeNetworkNodeReferencedWorkspace"),
      networkSummary: networkTrace
        ? t("knowledgeNetworkStats", {
            workspaceCount: networkTrace.workspaces.length,
            sourceCount: networkTrace.sources.length,
          })
        : t("knowledgeNetworkNodeSourceList"),
      importLabel: t("import"),
      switchToList: t("knowledgeNetworkSwitchToList"),
      switchToNetwork: t("openKnowledgeNetwork"),
      currentWorkspace: t("knowledgeNetworkNodeCurrentWorkspace"),
      referencedWorkspace: t("knowledgeNetworkNodeReferencedWorkspace"),
    }),
    [networkTrace, t],
  );
  const selectedKnowledgeNetworkNode = useMemo(
    () =>
      knowledgeNetworkMode &&
      networkTrace &&
      knowledgeNetworkGraphPlan &&
      knowledgeNetworkInspectorId
        ? knowledgeNetworkSelectedNodeDetails(
            networkTrace,
            knowledgeNetworkGraphPlan,
            knowledgeNetworkInspectorId,
            knowledgeNetworkNodeSelectionLabels,
          )
        : null,
    [
      knowledgeNetworkGraphPlan,
      knowledgeNetworkInspectorId,
      knowledgeNetworkMode,
      knowledgeNetworkNodeSelectionLabels,
      networkTrace,
    ],
  );
  const [composerSuggestion, setComposerSuggestion] = useState<ComposerSuggestion | null>(null);
  const [membershipTransitionArtifactId, setMembershipTransitionArtifactId] = useState<
    string | null
  >(null);
  const [membershipAnnouncement, setMembershipAnnouncement] = useState({
    message: "",
    sequence: 0,
  });
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [mobileCreationTool, setMobileCreationTool] = useState<ArtifactCreationToolId | null>(null);
  const [mobileChatFocusRequest, setMobileChatFocusRequest] = useState(0);
  const [mobileSourcesFocusRequest, setMobileSourcesFocusRequest] = useState(0);
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
  const messageScope = `${workspaceId}:${conversationId}`;
  const messageScopeRef = useRef(messageScope);
  messageScopeRef.current = messageScope;
  const [messageDetails, setMessageDetails] = useState<{
    scope: string;
    items: readonly ArtifactDetail[];
  }>({ scope: messageScope, items: [] });
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
    workspaceArtifactHistoryQuery,
    workspaceArtifactHistoryQueryKey,
  } = useArtifactWorkbenchData({
    conversationId,
    initialArtifact,
    initialArtifactHistory,
    selectedArtifactId,
    unavailableArtifactIds,
    workspaceId,
  });
  const refreshWorkspaceNavigation = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "conversations"] }),
      queryClient.invalidateQueries({
        queryKey: workspaceConversationNavigationQueryKey(workspaceId),
      }),
    ]);
  }, [queryClient, workspaceId]);
  const messageArtifactHistory = useMemo(() => {
    const details = messageDetails.scope === messageScope ? messageDetails.items : [];
    return [
      ...visibleArtifactHistory,
      ...details
        .filter((detail) => !visibleArtifactHistory.some((item) => item.id === detail.id))
        .map(artifactHistoryItemFromDetail),
    ];
  }, [messageDetails, messageScope, visibleArtifactHistory]);
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
        queryClient.invalidateQueries({ queryKey: workspaceArtifactHistoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "sources"] }),
      ]);
    },
    [cacheDetail, historyQueryKey, queryClient, workspaceArtifactHistoryQueryKey, workspaceId],
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
      await queryClient.invalidateQueries({ queryKey: workspaceArtifactHistoryQueryKey });
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
      await queryClient.invalidateQueries({ queryKey: workspaceArtifactHistoryQueryKey });
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
          .then((detail) => {
            if (messageScopeRef.current !== messageScope) return;
            cacheDetail(detail);
            void Promise.all([
              queryClient.invalidateQueries({ queryKey: historyQueryKey }),
              queryClient.invalidateQueries({ queryKey: workspaceArtifactHistoryQueryKey }),
            ]);
            setMessageDetails((current) => ({
              scope: messageScope,
              items: [
                ...(current.scope === messageScope
                  ? current.items.filter((item) => item.id !== detail.id)
                  : []),
                detail,
              ],
            }));
          })
          .catch((error: unknown) => {
            if (!(error instanceof ArtifactDetailError) || error.code !== "not_found") return;
            setUnavailableArtifactIds((current) => new Set(current).add(event.detail.id));
          });
        return;
      }
      cacheDetail(event.detail, { insertIntoHistory: true });
      void queryClient.invalidateQueries({ queryKey: workspaceArtifactHistoryQueryKey });
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
      historyQueryKey,
      initialArtifactHistory,
      messageScope,
      queryClient,
      router,
      unavailableArtifactIds,
      workspaceId,
      workspaceArtifactHistoryQueryKey,
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
  const retryArtifactFromMessage = useCallback(
    async (artifactId: string) => {
      const artifact = historyQuery.data.find((item) => item.id === artifactId);
      if (
        artifact?.canRetryGeneration !== true ||
        artifact.generationState !== "failed" ||
        (artifact.kind !== "presentation" && artifact.kind !== "animation")
      ) {
        throw new Error("artifact_not_retryable");
      }
      try {
        const detail = await retryArtifactGeneration({
          artifactId,
          conversationId,
          kind: artifact.kind,
          workspaceId,
        });
        cacheDetail(detail, { insertIntoHistory: true });
      } finally {
        await queryClient.invalidateQueries({ queryKey: historyQueryKey });
      }
    },
    [cacheDetail, conversationId, historyQuery.data, historyQueryKey, queryClient, workspaceId],
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
    mobileCreationTool ??
    (artifactSelection.mode === "starting"
      ? artifactSelection.toolId
      : activeArtifactKind
        ? studioToolForArtifactKind(activeArtifactKind)
        : null);
  const activeStudioTone = activeStudioTool ? studioToolTone(activeStudioTool) : "neutral";
  const isArtifactWorkspaceOpen = activeArtifactKind !== null;
  const activeArtifactInteractionSelection =
    artifactDetail &&
    artifactInteractionSelection &&
    artifactInteractionSelection.revisionId === artifactDetail.artifact?.currentRevision.id &&
    artifactKindForInteractionSelection(artifactInteractionSelection) === artifactDetail.kind
      ? artifactInteractionSelection
      : null;
  const surfaceContext: AgentSurfaceContext = mobileCreationTool
    ? {
        kind: artifactKindForSelection({ mode: "starting", toolId: mobileCreationTool }),
        type: "artifact_start",
      }
    : artifactSelection.mode === "starting" && activeArtifactKind
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
  const openKnowledgeNetwork = useCallback(() => {
    if (!networkTrace) return;
    void startWorkbenchPanelTransition(() => {
      setKnowledgeNetworkMode(true);
      setKnowledgeNetworkInspectorId(null);
      setKnowledgeNetworkSelectedId(null);
      setKnowledgeNetworkFocusRequest(null);
      setKnowledgeNetworkCitationFocus(null);
    }, shouldReduceMotion);
  }, [networkTrace, shouldReduceMotion]);
  const closeKnowledgeNetwork = useCallback(() => {
    knowledgeNetworkFocusRequestIdRef.current += 1;
    void startWorkbenchPanelTransition(() => {
      setKnowledgeNetworkMode(false);
      setKnowledgeNetworkInspectorId(null);
      setKnowledgeNetworkSelectedId(null);
      setKnowledgeNetworkFocusRequest(null);
      setKnowledgeNetworkCitationFocus(null);
    }, shouldReduceMotion);
  }, [shouldReduceMotion]);
  const focusKnowledgeNetworkCitation = useCallback(
    (evidence: KnowledgeCitationEvidence) => {
      if (!networkTrace?.sources.some((source) => source.id === evidence.sourceId)) return;
      knowledgeNetworkFocusRequestIdRef.current += 1;
      const requestId = knowledgeNetworkFocusRequestIdRef.current;
      const focus = { sourceId: evidence.sourceId, requestId };
      void startWorkbenchPanelTransition(() => {
        setNetworkTrace((current) =>
          current ? mergeKnowledgeNetworkCitation(current, evidence) : current,
        );
        setKnowledgeNetworkMode(true);
        setKnowledgeNetworkInspectorId(null);
        setKnowledgeNetworkSelectedId(evidence.evidenceId);
        setKnowledgeNetworkFocusRequest(focus);
        setKnowledgeNetworkCitationFocus(focus);
      }, shouldReduceMotion);
    },
    [networkTrace?.sources, shouldReduceMotion],
  );
  const handleKnowledgeNetworkSelect = useCallback((id: string | null) => {
    setKnowledgeNetworkSelectedId(id);
    setKnowledgeNetworkInspectorId(id);
  }, []);
  const handleKnowledgeNetworkSourceSelect = useCallback((id: string) => {
    setKnowledgeNetworkSelectedId(id);
    setKnowledgeNetworkInspectorId(id);
  }, []);
  const handleKnowledgeNetworkEnterWorkspace = useCallback(
    (target: KnowledgeNetworkWorkspaceNavigationTarget) => {
      if (!networkTrace) return;
      const nodeId = target.sourceId ?? target.workspaceId;
      const canonicalTarget = workspaceNavigationTarget(networkTrace, nodeId);
      if (
        !canonicalTarget ||
        canonicalTarget.workspaceId !== target.workspaceId ||
        canonicalTarget.sourceId !== target.sourceId ||
        canonicalTarget.reason !== target.reason ||
        canonicalTarget.workspaceId === networkTrace.currentWorkspaceId
      ) {
        return;
      }

      knowledgeNetworkFocusRequestIdRef.current += 1;
      const context: KnowledgeNetworkWorkspaceNavigationContext = {
        originWorkspaceId: networkTrace.currentWorkspaceId,
        targetWorkspaceId: canonicalTarget.workspaceId,
        sourceId: canonicalTarget.sourceId,
        reason: canonicalTarget.reason,
        requestId: knowledgeNetworkFocusRequestIdRef.current,
        returnView: {
          traceId: networkTrace.id,
          sourceMode: "network",
          selectedNodeId: canonicalTarget.sourceId ?? canonicalTarget.workspaceId,
          citationSourceId: knowledgeNetworkCitationFocus?.sourceId ?? null,
          requestId: knowledgeNetworkFocusRequestIdRef.current,
        },
      };
      beginKnowledgeNetworkNavigation(canonicalTarget.workspaceId, {
        context,
        originHref: conversationHref,
      });
      setKnowledgeNetworkMode(false);
      setKnowledgeNetworkInspectorId(null);
      setKnowledgeNetworkSelectedId(null);
      setKnowledgeNetworkFocusRequest(null);
      setKnowledgeNetworkCitationFocus(null);
      router.push(`/workspaces/${encodeURIComponent(canonicalTarget.workspaceId)}`);
    },
    [conversationHref, knowledgeNetworkCitationFocus?.sourceId, networkTrace, router],
  );
  const knowledgeNetworkHost = useMemo(
    () =>
      networkTrace
        ? {
            active: knowledgeNetworkMode,
            label: t("openKnowledgeNetwork"),
            open: openKnowledgeNetwork,
          }
        : null,
    [knowledgeNetworkMode, networkTrace, openKnowledgeNetwork, t],
  );
  const handleSelectTool = (toolId: Parameters<typeof artifactSelectionForTool>[0]) => {
    const selection = artifactSelectionForTool(toolId);
    if (!selection) return;
    pendingCreationSourceUserMessageId.current = null;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileCreationTool(selection.toolId);
      setMobileChatFocusRequest((current) => current + 1);
      setComposerFocusRequest((current) => current + 1);
      return;
    }
    startWorkbenchViewTransition(() =>
      dispatchArtifactSelection({ toolId: selection.toolId, type: "start" }),
    );
  };
  const handleOpenCreationTool = (toolId: Parameters<typeof artifactSelectionForTool>[0]) => {
    const selection = artifactSelectionForTool(toolId);
    if (!selection) return;
    pendingCreationSourceUserMessageId.current = null;
    setMobileCreationTool(null);
    startWorkbenchViewTransition(() =>
      dispatchArtifactSelection({ toolId: selection.toolId, type: "start" }),
    );
    router.replace(conversationHref, { scroll: false });
  };
  const chat = (
    <ChatPanelView
      {...fixture.chat}
      artifactHistory={messageArtifactHistory}
      artifactHistoryError={historyQuery.isError}
      conversationId={conversationId}
      initialMessagesNextCursor={initialMessagesNextCursor}
      onThreadTitle={(update) => {
        onThreadTitle(update);
        refreshWorkspaceNavigation();
      }}
      workspaceId={workspaceId}
      surfaceContext={surfaceContext}
      onUserMessageCreated={(snapshot: UserMessageSurfaceSnapshot) => {
        if (mobileCreationTool && snapshot.surface.type === "artifact_start") {
          setMobileCreationTool(null);
          pendingCreationSourceUserMessageId.current = null;
          return;
        }
        pendingCreationSourceUserMessageId.current =
          snapshot.surface.type === "artifact_start" ? snapshot.id : null;
      }}
      composerSuggestion={composerSuggestion}
      onComposerSuggestionConsumed={consumeComposerSuggestion}
      onArtifactEvent={handleArtifactEvent}
      onOpenArtifact={(artifactId) => void openArtifactFromMessage(artifactId)}
      onRetryArtifact={retryArtifactFromMessage}
      onOpenKnowledgeNetwork={focusKnowledgeNetworkCitation}
      onSelectTool={handleSelectTool}
      selectedCreationTool={mobileCreationTool}
      onClearCreationTool={() => setMobileCreationTool(null)}
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
  const assistant = selectedKnowledgeNetworkNode ? (
    <KnowledgeNetworkSelectionPanel
      labels={knowledgeNetworkNodeSelectionLabels}
      node={selectedKnowledgeNetworkNode}
      onClose={() => setKnowledgeNetworkInspectorId(null)}
      onEnterWorkspace={handleKnowledgeNetworkEnterWorkspace}
      onSelectNode={handleKnowledgeNetworkSourceSelect}
    />
  ) : (
    chat
  );
  return (
    <KnowledgeNetworkHostProvider value={knowledgeNetworkHost}>
      <ArtifactSourceTransitionProvider value={artifactSourceTransition}>
        <div
          data-workspace-style="mist-zinc"
          data-workspace-theme="mist-zinc"
          data-studio-tone={activeStudioTone}
          className="workspace-theme-root relative flex h-dvh select-none flex-col overflow-hidden bg-[var(--workspace-bg-base)]"
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
          {returnToKnowledgeNetwork ? (
            <div
              className="pointer-events-none absolute right-6 z-40"
              style={{ top: "calc(var(--workspace-header-height) + 0.75rem)" }}
            >
              <button
                type="button"
                aria-label={t("knowledgeNetworkReturnToCurrentWorkspace")}
                title={t("knowledgeNetworkReturnToCurrentWorkspace")}
                onClick={returnToKnowledgeNetwork}
                className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-xs font-semibold text-[var(--studio-accent-text)] shadow-sm transition-[background-color,box-shadow,transform] hover:bg-[var(--studio-surface-subtle)] hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{t("knowledgeNetworkReturnToCurrentWorkspace")}</span>
              </button>
            </div>
          ) : null}
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
            workspaces={navigationWorkspaces}
            workspaceArtifacts={workspaceArtifactHistoryQuery.data ?? []}
            mobileCreationTools={mobileCreationTools}
            mobileOverview={mobileOverview}
            mobileAccount={mobileAccount}
            mobileAccountData={mobileAccountData}
            onOpenMobileAccount={() => {
              router.push(`${conversationHref}&view=account`, { scroll: false });
            }}
            onOpenMobileCreationTools={() => {
              router.push(`${conversationHref}&view=tools`, { scroll: false });
            }}
            onOpenMobileSources={() => {
              try {
                window.localStorage.setItem(mobilePanelPreferenceKey(workspaceId), "sources");
              } catch {
                // The panel request still works when browser storage is unavailable.
              }
              if (isArtifactWorkspaceOpen || mobileOverview) {
                if (isArtifactWorkspaceOpen) {
                  startWorkbenchViewTransition(() =>
                    dispatchArtifactSelection({ type: "openStudio" }),
                  );
                }
                router.replace(conversationHref, { scroll: false });
              }
              setMobileSourcesFocusRequest((current) => current + 1);
            }}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className={
              "relative min-h-0 flex-1 " +
              (mobileAccount ? "overflow-y-auto overscroll-contain lg:overflow-visible" : "")
            }
          >
            {mobileCreationTools ? (
              <MobileCreationToolsPage
                onSelectTool={handleOpenCreationTool}
                runtimeUnavailableTools={fixture.studio.runtimeUnavailableTools}
              />
            ) : null}
            {mobileAccount ? mobileAccountPage : null}
            {mobileOverview ? (
              <MobileWorkspaceOverview
                conversations={conversations}
                newConversationHref={`${workspaceHref}?conversation=${newConversationId}`}
                ownerHandle={workspaceOwnerHandle}
                sourceCount={sourceCount}
                workspaceHref={workspaceHref}
                workspaceName={fixture.workspace.workspaceName}
              />
            ) : null}
            <div
              className={
                mobileOverview || mobileCreationTools || mobileAccount
                  ? "hidden h-full lg:block"
                  : "h-full"
              }
            >
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
                        setMobileChatFocusRequest((current) => current + 1);
                        startWorkbenchViewTransition(() => {
                          dispatchArtifactSelection({ type: "openStudio" });
                        });
                        router.replace(conversationHref, { scroll: false });
                      }}
                      onSuggestion={(text) =>
                        setComposerSuggestion((current) => ({ id: (current?.id ?? 0) + 1, text }))
                      }
                      phase={artifactWorkspacePhase(artifactDetail?.generationState)}
                      mobilePreview={isMobileArtifactPreview}
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
                  mobileChatFocusRequest={mobileChatFocusRequest}
                  mobileSourcesFocusRequest={mobileSourcesFocusRequest}
                  studio={(studioControls) => (
                    <StudioPanelView
                      {...fixture.studio}
                      artifactHistory={visibleArtifactHistory}
                      artifactHistoryError={historyQuery.isError}
                      artifactHref={(artifactId) => artifactHref(artifactId)}
                      isRefreshingHistory={historyQuery.isFetching}
                      onRefreshHistory={() => void historyQuery.refetch()}
                      onDeleteArtifact={(artifactId) =>
                        deleteArtifactMutation.mutateAsync(artifactId)
                      }
                      {...(canPublishArtifacts
                        ? {
                            onAddArtifactSource: async (artifactId: string) => {
                              await addArtifactSourceMutation.mutateAsync(artifactId);
                            },
                          }
                        : {})}
                      addingArtifactSourceId={
                        addArtifactSourceMutation.isPending
                          ? addArtifactSourceMutation.variables
                          : null
                      }
                      artifactSourceAddError={addArtifactSourceMutation.isError}
                      onOpenArtifact={(artifactId) => {
                        pendingCreationSourceUserMessageId.current = null;
                        startWorkbenchViewTransition(() =>
                          dispatchArtifactSelection({ artifactId, type: "select" }),
                        );
                        router.push(artifactHref(artifactId), { scroll: false });
                      }}
                      onSelectTool={handleSelectTool}
                      selectedArtifactId={selectedArtifactId}
                      collapsed={studioControls.collapsed}
                      historyFocusRequest={studioControls.historyFocusRequest}
                      onExpand={studioControls.expand}
                      onShowHistory={studioControls.showHistory}
                    />
                  )}
                  chat={assistant}
                  layoutMode={knowledgeNetworkMode ? "network-focus" : "default"}
                  sources={
                    networkTrace && knowledgeNetworkMode && knowledgeNetworkGraphPlan ? (
                      <KnowledgeNetworkSourcesPanel
                        labels={knowledgeNetworkLabels}
                        graphPlan={knowledgeNetworkGraphPlan}
                        theme={resolvedWorkspaceTheme}
                        selectedId={knowledgeNetworkSelectedId}
                        shouldReduceMotion={shouldReduceMotion}
                        sourceMode="network"
                        sourceEntries={knowledgeNetworkSourceEntries}
                        trace={networkTrace}
                        focusRequest={knowledgeNetworkFocusRequest}
                        citationFocus={knowledgeNetworkCitationFocus}
                        onSelect={handleKnowledgeNetworkSourceSelect}
                        onGraphSelect={handleKnowledgeNetworkSelect}
                        selectionLabels={knowledgeNetworkNodeSelectionLabels}
                        onSourceModeChange={(mode) => {
                          if (mode === "list") closeKnowledgeNetwork();
                        }}
                      />
                    ) : (
                      sourcesPanel
                    )
                  }
                  workspaceId={workspaceId}
                />
              )}
            </div>
          </main>
        </div>
      </ArtifactSourceTransitionProvider>
    </KnowledgeNetworkHostProvider>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    if (typeof media.addListener === "function") {
      media.addListener(update);
      return () => media.removeListener(update);
    }
    return undefined;
  }, []);

  return prefersReducedMotion;
}

function KnowledgeNetworkSelectionPanel({
  labels,
  node,
  onClose,
  onEnterWorkspace,
  onSelectNode,
}: {
  labels: KnowledgeNetworkNodeSelectionLabels;
  node: KnowledgeNetworkSelectedNode;
  onClose: () => void;
  onEnterWorkspace: (target: KnowledgeNetworkWorkspaceNavigationTarget) => void;
  onSelectNode: (id: string) => void;
}) {
  return (
    <PanelShell className="workspace-assistant-tone-panel" testId="knowledge-network-node-panel">
      <div className="flex h-[52px] items-center border-b border-[var(--workspace-border)] px-4">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold leading-tight">
          {labels.detailsTitle}
        </h2>
        <button
          type="button"
          aria-label={labels.close}
          title={labels.close}
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="workspace-chat-viewport min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <KnowledgeNetworkNodeInspector
          node={node}
          labels={labels}
          variant="panel"
          onClose={onClose}
          onEnterWorkspace={onEnterWorkspace}
          onSelectNode={onSelectNode}
        />
      </div>
    </PanelShell>
  );
}
