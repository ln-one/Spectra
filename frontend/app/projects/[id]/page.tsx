"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { TokenStorage } from "@/lib/auth";
import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { useProjectStore, type GenerationTool } from "@/stores/projectStore";
import {
  ChatPanel,
  LibraryDrawer,
  ProjectHeader,
  type SessionSwitcherItem,
  SourcesPanel,
  StudioPanel,
} from "@/components/project";
import { LightRays } from "@/components/ui/light-rays";

const springConfig = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 1,
} as const;

const PAGE_GAP = 24;
const PANEL_GAP = 12;
const MIN_RESIZABLE_PANEL_WIDTH = 85;
const MIN_EXPANDED_RIGHT_PANEL_WIDTH = 260;
const COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX = 126;
const COLLAPSED_SOURCES_WIDTH_PX = 85;
const COLLAPSED_SOURCES_TRIGGER_WIDTH_PX = 180;
const EXPANDED_SOURCES_COMFORT_WIDTH_PX = 280;
const SOURCES_TITLE_SAFE_MIN_WIDTH_PX = 214;

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectDetailPage() {
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
  const [chatWidth, setChatWidth] = useState(50);
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
  const sessionOptions: SessionSwitcherItem[] = generationHistory.map(
    (item) => ({
      sessionId: item.id,
      title: `会话 ${item.id.slice(-6)}`,
      updatedAt: formatSessionTime(item.createdAt),
    })
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
    void fetchMessages(projectId);
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
    if (generationHistory.length === 0) return;

    const allSessionIds = generationHistory.map((item) => item.id);
    const preferredSessionId =
      querySessionId && allSessionIds.includes(querySessionId)
        ? querySessionId
        : allSessionIds[0];

    if (preferredSessionId && preferredSessionId !== activeSessionId) {
      setActiveSessionId(preferredSessionId);
      void fetchArtifactHistory(projectId, preferredSessionId);
    }

    if (preferredSessionId) {
      void fetchMessages(projectId, preferredSessionId);
    }

    if (preferredSessionId && querySessionId !== preferredSessionId) {
      updateSessionInUrl(preferredSessionId);
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

  const handleToolClick = async (_tool: GenerationTool) => {
    // Session is created when user starts generation from config panel.
  };

  const handleChangeSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === "empty") return;
      setActiveSessionId(sessionId);
      updateSessionInUrl(sessionId);
      await fetchMessages(projectId, sessionId);
      await fetchArtifactHistory(projectId, sessionId);
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
      });
      const newSessionId = response.data?.session?.session_id;
      if (!newSessionId) return;

      await fetchGenerationHistory(projectId);
      await handleChangeSession(newSessionId);
      toast({
        title: "已创建新会话",
        description: `会话 ID：${newSessionId.slice(0, 8)}...`,
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
        ? window.innerHeight - PAGE_GAP * 2
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
      panelAreaRef.current?.clientHeight ?? window.innerHeight - PAGE_GAP * 2;
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
          window.innerHeight - PAGE_GAP * 2;
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

  if (isLoading) {
    return (
      <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
        <LightRays
          count={8}
          color="rgba(180, 200, 255, 0.15)"
          blur={40}
          speed={16}
          length="80vh"
          className="opacity-70"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 relative z-10"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">加载中...</span>
        </motion.div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
        <LightRays
          count={8}
          color="rgba(180, 200, 255, 0.15)"
          blur={40}
          speed={16}
          length="80vh"
          className="opacity-70"
        />
        <div className="text-center relative z-10">
          <p className="text-zinc-600">项目不存在</p>
          <button
            onClick={() => router.push("/projects")}
            className="mt-4 px-4 py-2 bg-zinc-900 text-white text-sm rounded-full hover:bg-zinc-800 transition-colors"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  const sourcesWidth = sourcesWidthPercent;

  return (
    <div className="h-screen flex flex-col bg-zinc-100 overflow-hidden relative">
      <LightRays
        count={10}
        color="rgba(200, 220, 255, 0.12)"
        blur={48}
        speed={18}
        length="90vh"
        className="opacity-80"
      />

      <ProjectHeader
        sessions={sessionOptions}
        activeSessionId={activeSessionId}
        onChangeSession={handleChangeSession}
        onCreateSession={handleCreateSession}
        isCreatingSession={isCreatingSession}
        onOpenLibrary={() => setIsLibraryOpen(true)}
      />

      <div className="flex-1 min-h-0 relative" style={{ padding: PAGE_GAP }}>
        <motion.div
          ref={panelAreaRef}
          className="absolute inset-0"
          style={{ padding: PAGE_GAP }}
          initial={false}
        >
          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: PAGE_GAP,
              top: PAGE_GAP,
              width: isExpanded
                ? `calc(${expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <StudioPanel onToolClick={handleToolClick} />
          </motion.div>

          <motion.div
            className="absolute cursor-col-resize z-10"
            style={{
              top: PAGE_GAP,
              height: `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`
                : `calc(${studioWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
              width: PANEL_GAP,
            }}
            transition={springConfig}
            onMouseDown={(event) =>
              handleMouseDown(
                event,
                isExpanded ? "expanded-studio-right" : "studio-chat"
              )
            }
          />

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% + ${PANEL_GAP / 2}px)`,
              top: PAGE_GAP,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${chatWidth}% - ${PANEL_GAP}px)`,
              height: isExpanded
                ? `calc(${expandedChatHeight}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <ChatPanel projectId={projectId} />
          </motion.div>

          {!isExpanded ? (
            <motion.div
              className="absolute cursor-col-resize z-10"
              style={{
                top: PAGE_GAP,
                height: `calc(100% - ${PAGE_GAP * 2}px)`,
              }}
              initial={false}
              animate={{
                left: `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(event) => handleMouseDown(event, "chat-sources")}
            />
          ) : null}

          {isExpanded ? (
            <motion.div
              className="absolute cursor-row-resize z-10"
              style={{
                left: `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`,
              }}
              initial={false}
              animate={{
                top: `calc(${expandedChatHeight}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
                height: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(event) =>
                handleMouseDown(event, "expanded-chat-sources")
              }
            />
          ) : null}

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2}px)`,
              top: isExpanded
                ? `calc(${expandedChatHeight}% + ${PANEL_GAP / 2}px)`
                : PAGE_GAP,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${sourcesWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: isExpanded
                ? `calc(${100 - expandedChatHeight}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <SourcesPanel
              projectId={projectId}
              isCollapsed={isSourcesCollapsedByWidth}
              onToggleCollapsed={toggleSourcesCollapsed}
              isStudioExpanded={isExpanded}
              isExpandedContentCollapsed={isExpandedSourcesCollapsedByHeight}
              onToggleExpandedContentCollapsed={handleToggleExpandedSources}
            />
          </motion.div>
        </motion.div>
      </div>

      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] text-zinc-400">
          Spectra 输出内容可能存在偏差，请在课堂使用前进行复核。
        </p>
      </div>

      <LibraryDrawer
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        projectId={projectId}
      />
    </div>
  );
}
