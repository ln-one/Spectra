import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TokenStorage } from "@/lib/auth";
import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  useProjectStore,
  type GenerationHistory,
  type GenerationTool,
} from "@/stores/projectStore";
import type { SessionSwitcherItem } from "@/components/project";
import {
  COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX,
  COLLAPSED_SOURCES_TRIGGER_WIDTH_PX,
  COLLAPSED_SOURCES_WIDTH_PX,
  EXPANDED_SOURCES_COMFORT_WIDTH_PX,
  HEADER_TO_PANEL_GAP,
  MIN_EXPANDED_RIGHT_PANEL_WIDTH,
  MIN_RESIZABLE_PANEL_WIDTH,
  PAGE_GAP,
  PANEL_GAP,
  SOURCES_TITLE_SAFE_MIN_WIDTH_PX,
  formatSessionTime,
} from "./constants";

export function resolvePreferredSessionId(
  querySessionId: string | null,
  generationHistory: GenerationHistory[],
  activeSessionId: string | null
): string | null {
  const allSessionIds = Array.from(
    new Set(generationHistory.map((item) => item.id))
  );
  if (querySessionId && allSessionIds.includes(querySessionId)) {
    return querySessionId;
  }
  if (activeSessionId && allSessionIds.includes(activeSessionId)) {
    return activeSessionId;
  }
  return generationHistory.length > 0 ? generationHistory[0].id : null;
}

export function dedupeGenerationHistory(
  generationHistory: GenerationHistory[]
): GenerationHistory[] {
  const seen = new Set<string>();
  return generationHistory.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function useProjectDetailController() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const querySessionId = searchParams.get("session");

  const {
    project,
    isLoading,
    layoutMode,
    fetchProject,
    fetchFiles,
    fetchMessages,
    fetchGenerationHistory,
    fetchArtifactHistory,
    setActiveSessionId,
    generationHistory,
    activeSessionId,
    reset,
  } = useProjectStore();

  const [studioWidth, setStudioWidth] = useState(25);
  const [chatWidth, setChatWidth] = useState(52);
  const [expandedStudioWidth, setExpandedStudioWidth] = useState(70);
  const [expandedChatHeight, setExpandedChatHeight] = useState(50);
  const [panelAreaWidth, setPanelAreaWidth] = useState(0);
  const [panelAreaHeight, setPanelAreaHeight] = useState(0);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const panelAreaRef = useRef<HTMLDivElement | null>(null);
  const previousChatWidthRef = useRef<number | null>(null);
  const previousExpandedChatHeightRef = useRef<number | null>(null);
  const startSizesRef = useRef({
    studio: 0,
    chat: 0,
    expandedStudio: 0,
    expandedChatHeight: 0,
  });

  const isExpanded = layoutMode === "expanded";
  const sessionOptions: SessionSwitcherItem[] = useMemo(
    () =>
      dedupeGenerationHistory(generationHistory).map((item) => ({
        sessionId: item.id,
        title: `会话 ${item.id.slice(-6)}`,
        updatedAt: formatSessionTime(item.createdAt),
      })),
    [generationHistory]
  );

  const updateSessionInUrl = useCallback(
    (sessionId: string) => {
      const nextSearch = new URLSearchParams(searchParams.toString());
      nextSearch.set("session", sessionId);
      router.replace(`/projects/${projectId}?${nextSearch.toString()}`, {
        scroll: false,
      });
    },
    [projectId, router, searchParams]
  );

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    void fetchProject(projectId);
    void fetchFiles(projectId);
    void fetchGenerationHistory(projectId);

    return () => {
      reset();
    };
  }, [
    projectId,
    router,
    fetchProject,
    fetchFiles,
    fetchMessages,
    fetchGenerationHistory,
    reset,
  ]);

  useEffect(() => {
    const nextSessionId = resolvePreferredSessionId(
      querySessionId,
      generationHistory,
      activeSessionId
    );

    if (!nextSessionId) {
      if (activeSessionId !== null) {
        setActiveSessionId(null);
      }
      useProjectStore.setState({
        generationSession: null,
        messages: [],
        artifactHistoryByTool: {
          ppt: [],
          word: [],
          mindmap: [],
          outline: [],
          quiz: [],
          summary: [],
          animation: [],
          handout: [],
        },
        currentSessionArtifacts: [],
      });
      return;
    }

    if (nextSessionId !== activeSessionId) {
      setActiveSessionId(nextSessionId);
      void fetchArtifactHistory(projectId, nextSessionId);
    }

    void fetchMessages(projectId, nextSessionId);

    if (querySessionId !== nextSessionId) {
      updateSessionInUrl(nextSessionId);
    }
  }, [
    generationHistory,
    querySessionId,
    activeSessionId,
    fetchArtifactHistory,
    fetchMessages,
    projectId,
    setActiveSessionId,
    updateSessionInUrl,
  ]);

  useEffect(() => {
    if (!activeSessionId) {
      useProjectStore.setState({ generationSession: null });
      return;
    }

    let cancelled = false;

    const syncGenerationSession = async () => {
      try {
        const response = await generateApi.getSession(activeSessionId);
        if (!cancelled) {
          useProjectStore.setState({
            generationSession: response?.data ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          useProjectStore.setState({ generationSession: null });
        }
      }
    };

    void syncGenerationSession();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const handleToolClick = async (_tool: GenerationTool) => {
    // Session is created when user starts generation from config panel.
  };

  const handleChangeSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === "empty") return;
      setActiveSessionId(sessionId);
      updateSessionInUrl(sessionId);
      await Promise.allSettled([
        fetchMessages(projectId, sessionId),
        fetchArtifactHistory(projectId, sessionId),
      ]);
    },
    [
      fetchArtifactHistory,
      fetchMessages,
      projectId,
      setActiveSessionId,
      updateSessionInUrl,
    ]
  );

  const handleCreateSession = useCallback(async () => {
    setIsCreatingSession(true);
    try {
      const response = await generateApi.createSession({
        project_id: projectId,
        output_type: "both",
        bootstrap_only: true,
      });
      const newSessionId = response.data?.session?.session_id;
      if (!newSessionId) return;

      await fetchGenerationHistory(projectId);
      await handleChangeSession(newSessionId);
      toast({
        title: "已创建新会话",
        description: `会话 ID: ${newSessionId.slice(0, 8)}...`,
      });
    } catch (error) {
      toast({
        title: "创建会话失败",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsCreatingSession(false);
    }
  }, [fetchGenerationHistory, handleChangeSession, projectId]);

  useEffect(() => {
    if (isLoading) return;
    const target = panelAreaRef.current;
    if (!target) return;

    const syncSize = () => {
      setPanelAreaWidth(target.clientWidth);
      setPanelAreaHeight(target.clientHeight);
    };
    syncSize();

    const observer = new ResizeObserver(syncSize);
    observer.observe(target);
    window.addEventListener("resize", syncSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [isLoading]);

  const sourcesWidthPercent = 100 - studioWidth - chatWidth;
  const effectivePanelAreaWidth =
    panelAreaWidth > 0
      ? panelAreaWidth
      : typeof window !== "undefined"
        ? window.innerWidth - PAGE_GAP * 2
        : 0;
  const sourcesWidthPx =
    effectivePanelAreaWidth > 0
      ? (effectivePanelAreaWidth * sourcesWidthPercent) / 100 -
        (PAGE_GAP + PANEL_GAP / 2)
      : 0;
  const isSourcesCollapsedByWidth =
    !isExpanded &&
    sourcesWidthPx > 0 &&
    sourcesWidthPx <= COLLAPSED_SOURCES_TRIGGER_WIDTH_PX;
  const effectivePanelAreaHeight =
    panelAreaHeight > 0
      ? panelAreaHeight
      : typeof window !== "undefined"
        ? window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP)
        : 0;
  const expandedSourcesHeightPx =
    effectivePanelAreaHeight > 0
      ? (effectivePanelAreaHeight * (100 - expandedChatHeight)) / 100 -
        (PAGE_GAP + PANEL_GAP / 2)
      : 0;
  const isExpandedSourcesCollapsedByHeight =
    isExpanded &&
    expandedSourcesHeightPx > 0 &&
    expandedSourcesHeightPx <= COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + 2;

  const toggleSourcesCollapsed = useCallback(
    (action: "collapse" | "expand" | "toggle" = "toggle") => {
      if (isExpanded) return;

      const containerWidth =
        panelAreaRef.current?.clientWidth ?? window.innerWidth - PAGE_GAP * 2;
      const minSourcesPercent =
        ((MIN_RESIZABLE_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
          containerWidth) *
        100;
      const maxChatBySources = Math.min(
        75,
        100 - studioWidth - minSourcesPercent
      );

      const applyTargetSourcesWidth = (targetWidthPx: number) => {
        const targetSourcesPercent = Math.max(
          minSourcesPercent,
          ((targetWidthPx + PAGE_GAP + PANEL_GAP / 2) / containerWidth) * 100
        );
        const targetChat = 100 - studioWidth - targetSourcesPercent;
        const nextChat = Math.max(30, Math.min(maxChatBySources, targetChat));
        setChatWidth(nextChat);
      };

      const shouldExpand =
        action === "expand" ||
        (action === "toggle" && isSourcesCollapsedByWidth);

      if (shouldExpand) {
        if (previousChatWidthRef.current !== null) {
          const restoredChat = Math.max(
            30,
            Math.min(maxChatBySources, previousChatWidthRef.current)
          );
          setChatWidth(restoredChat);
          return;
        }
        applyTargetSourcesWidth(EXPANDED_SOURCES_COMFORT_WIDTH_PX);
        return;
      }

      previousChatWidthRef.current = chatWidth;
      applyTargetSourcesWidth(COLLAPSED_SOURCES_WIDTH_PX);
    },
    [chatWidth, isExpanded, isSourcesCollapsedByWidth, studioWidth]
  );

  const handleToggleExpandedSources = useCallback(() => {
    if (!isExpanded) return;

    const containerHeight =
      panelAreaRef.current?.clientHeight ??
      window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP);
    const maxChatByCollapsedSources =
      100 -
      ((COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + PAGE_GAP + PANEL_GAP / 2) /
        containerHeight) *
        100;

    if (!isExpandedSourcesCollapsedByHeight) {
      previousExpandedChatHeightRef.current = expandedChatHeight;
      setExpandedChatHeight(
        Math.max(30, Math.min(92, maxChatByCollapsedSources))
      );
      return;
    }

    setExpandedChatHeight(previousExpandedChatHeightRef.current ?? 50);
  }, [expandedChatHeight, isExpanded, isExpandedSourcesCollapsedByHeight]);

  const handleMouseDown = useCallback(
    (
      event: React.MouseEvent,
      handle:
        | "studio-chat"
        | "chat-sources"
        | "expanded-studio-right"
        | "expanded-chat-sources"
    ) => {
      event.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = event.clientX;
      startYRef.current = event.clientY;
      startSizesRef.current = {
        studio: studioWidth,
        chat: chatWidth,
        expandedStudio: expandedStudioWidth,
        expandedChatHeight: expandedChatHeight,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;

        const deltaX = moveEvent.clientX - startXRef.current;
        const deltaY = moveEvent.clientY - startYRef.current;
        const containerWidth =
          panelAreaRef.current?.clientWidth ?? window.innerWidth - PAGE_GAP * 2;
        const containerHeight =
          panelAreaRef.current?.clientHeight ??
          window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP);
        const deltaPercent = (deltaX / containerWidth) * 100;
        const deltaYPercent = (deltaY / containerHeight) * 100;

        if (handle === "studio-chat") {
          const nextStudio = Math.max(
            15,
            Math.min(40, startSizesRef.current.studio + deltaPercent)
          );
          const nextChat = Math.max(
            30,
            Math.min(60, startSizesRef.current.chat - deltaPercent)
          );
          setStudioWidth(nextStudio);
          setChatWidth(nextChat);
          return;
        }

        if (handle === "chat-sources") {
          const minSourcesPercent =
            ((MIN_RESIZABLE_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
              containerWidth) *
            100;
          const maxChatBySources = Math.min(
            75,
            100 - startSizesRef.current.studio - minSourcesPercent
          );
          let nextChat = Math.max(
            30,
            Math.min(
              Math.max(30, maxChatBySources),
              startSizesRef.current.chat + deltaPercent
            )
          );

          const toChatBySourcesWidthPx = (targetWidthPx: number) => {
            const targetSourcesPercent =
              ((targetWidthPx + PAGE_GAP + PANEL_GAP / 2) / containerWidth) *
              100;
            const targetChat =
              100 - startSizesRef.current.studio - targetSourcesPercent;
            return Math.max(
              30,
              Math.min(Math.max(30, maxChatBySources), targetChat)
            );
          };

          const startSourcesPercent =
            100 - startSizesRef.current.studio - startSizesRef.current.chat;
          const startSourcesWidthPx =
            (containerWidth * startSourcesPercent) / 100 -
            (PAGE_GAP + PANEL_GAP / 2);
          const startedCollapsed =
            startSourcesWidthPx <= COLLAPSED_SOURCES_TRIGGER_WIDTH_PX + 2;

          const nextSourcesPercent =
            100 - startSizesRef.current.studio - nextChat;
          const nextSourcesWidthPx =
            (containerWidth * nextSourcesPercent) / 100 -
            (PAGE_GAP + PANEL_GAP / 2);

          const collapseSnapThreshold = COLLAPSED_SOURCES_TRIGGER_WIDTH_PX + 4;
          const expandSnapThreshold = COLLAPSED_SOURCES_TRIGGER_WIDTH_PX - 60;

          if (deltaX > 0 && nextSourcesWidthPx <= collapseSnapThreshold) {
            nextChat = toChatBySourcesWidthPx(COLLAPSED_SOURCES_WIDTH_PX);
          } else if (
            deltaX < 0 &&
            startedCollapsed &&
            nextSourcesWidthPx >= expandSnapThreshold
          ) {
            nextChat = toChatBySourcesWidthPx(SOURCES_TITLE_SAFE_MIN_WIDTH_PX);
          }

          setChatWidth(nextChat);
          return;
        }

        if (handle === "expanded-studio-right") {
          const maxExpandedStudioByWidth =
            100 -
            ((MIN_EXPANDED_RIGHT_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
              containerWidth) *
              100;
          const nextExpandedStudio = Math.max(
            45,
            Math.min(
              Math.max(45, Math.min(92, maxExpandedStudioByWidth)),
              startSizesRef.current.expandedStudio + deltaPercent
            )
          );
          setExpandedStudioWidth(nextExpandedStudio);
          return;
        }

        const maxExpandedChatHeight =
          100 -
          ((COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + PAGE_GAP + PANEL_GAP / 2) /
            containerHeight) *
            100;
        const nextExpandedChatHeight = Math.max(
          30,
          Math.min(
            Math.min(92, maxExpandedChatHeight),
            startSizesRef.current.expandedChatHeight + deltaYPercent
          )
        );
        setExpandedChatHeight(nextExpandedChatHeight);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [studioWidth, chatWidth, expandedStudioWidth, expandedChatHeight]
  );

  return {
    router,
    project,
    isLoading,
    projectId,
    isExpanded,
    sessionOptions,
    activeSessionId,
    isCreatingSession,
    isLibraryOpen,
    setIsLibraryOpen,
    panelAreaRef,
    studioWidth,
    chatWidth,
    expandedStudioWidth,
    expandedChatHeight,
    handleToolClick,
    handleChangeSession,
    handleCreateSession,
    handleMouseDown,
    sourcesWidthPercent,
    isSourcesCollapsedByWidth,
    toggleSourcesCollapsed,
    isExpandedSourcesCollapsedByHeight,
    handleToggleExpandedSources,
  };
}
