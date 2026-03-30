import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { authService, TokenStorage } from "@/lib/auth";
import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { useProjectStore, type GenerationTool } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import type { SessionSwitcherItem, ThemePresetId } from "@/components/project";
import { formatSessionTime } from "./constants";
import {
  DEFAULT_PROJECT_THEME_PRESET,
  PROJECT_THEME_STORAGE_KEY,
  resolveProjectThemePreset,
} from "./theme";
import {
  resolvePreferredSessionId,
  useProjectPanelLayout,
} from "./useProjectPanelLayout";

function readRecordFromStorage<T extends Record<string, unknown>>(
  raw: string | null
): T {
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // ignore invalid storage payload and fallback to empty map
  }
  return {} as T;
}

function mapRunStatusLabel(runStatus?: string, runStep?: string): string {
  if (runStatus === "completed" && runStep === "completed") return "已完成";
  if (
    runStatus === "processing" &&
    (runStep === "outline" || runStep === "generate")
  ) {
    return "进行中";
  }
  if (runStatus === "failed") return "失败";
  return runStatus || "processing";
}

function formatRunSummaryLine(run: {
  run_no?: number;
  run_title?: string;
  run_status?: string;
  run_step?: string;
}): string {
  const runNo = typeof run.run_no === "number" ? `#${run.run_no}` : "Run";
  const runTitle = run.run_title?.trim() || "pending";
  const mappedStatus = mapRunStatusLabel(run.run_status, run.run_step);
  const runStep = run.run_step || "-";
  return `${runNo} · ${runTitle} · ${mappedStatus}/${runStep}`;
}
export function useProjectDetailController() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const querySessionId = searchParams.get("session");
  const queryRunId = searchParams.get("run");

  const {
    project,
    isLoading,
    layoutMode,
    expandedTool,
    fetchProject,
    fetchFiles,
    fetchMessages,
    fetchGenerationHistory,
    fetchArtifactHistory,
    setActiveSessionId,
    setActiveRunId,
    generationHistory,
    activeSessionId,
    activeRunId,
    reset,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      isLoading: state.isLoading,
      layoutMode: state.layoutMode,
      expandedTool: state.expandedTool,
      fetchProject: state.fetchProject,
      fetchFiles: state.fetchFiles,
      fetchMessages: state.fetchMessages,
      fetchGenerationHistory: state.fetchGenerationHistory,
      fetchArtifactHistory: state.fetchArtifactHistory,
      setActiveSessionId: state.setActiveSessionId,
      setActiveRunId: state.setActiveRunId,
      generationHistory: state.generationHistory,
      activeSessionId: state.activeSessionId,
      activeRunId: state.activeRunId,
      reset: state.reset,
    }))
  );

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessionRunSummaryById, setSessionRunSummaryById] = useState<
    Record<string, { summary: string; artifactId: string | null }>
  >({});
  const [hiddenSessionIds, setHiddenSessionIds] = useState<
    Record<string, true>
  >({});
  const [selectedThemePreset, setSelectedThemePreset] = useState<ThemePresetId>(
    DEFAULT_PROJECT_THEME_PRESET
  );

  const panelLayout = useProjectPanelLayout({ layoutMode, isLoading });

  const visibleGenerationHistory = useMemo(
    () => generationHistory.filter((item) => !hiddenSessionIds[item.id]),
    [generationHistory, hiddenSessionIds]
  );

  const sessionOptions: SessionSwitcherItem[] = useMemo(
    () =>
      visibleGenerationHistory.map((item) => ({
        sessionId: item.id,
        title: (item.title || "").trim() || `会话 ${item.id.slice(-6)}`,
        updatedAt: formatSessionTime(item.createdAt),
        runSummary: sessionRunSummaryById[item.id]?.summary,
        artifactId: sessionRunSummaryById[item.id]?.artifactId ?? null,
      })),
    [sessionRunSummaryById, visibleGenerationHistory]
  );

  useEffect(() => {
    let cancelled = false;
    if (visibleGenerationHistory.length === 0) {
      setSessionRunSummaryById({});
      return;
    }

    const loadRunSummary = async () => {
      const entries = await Promise.all(
        visibleGenerationHistory.map(async (item) => {
          try {
            const response = await generateApi.listRuns(item.id, { limit: 2 });
            const runs = response?.data?.runs ?? [];
            const latestRun = runs[0];
            if (!latestRun) return [item.id, null] as const;
            const previousRun = runs[1];
            const latestSummary = formatRunSummaryLine(latestRun);
            const previousSummary = previousRun
              ? `上次 ${formatRunSummaryLine(previousRun)}`
              : "";
            return [
              item.id,
              {
                summary: previousSummary
                  ? `${latestSummary} | ${previousSummary}`
                  : latestSummary,
                artifactId:
                  latestRun.artifact_id ?? previousRun?.artifact_id ?? null,
              },
            ] as const;
          } catch {
            return [item.id, null] as const;
          }
        })
      );

      if (cancelled) return;
      const nextMap: Record<
        string,
        { summary: string; artifactId: string | null }
      > = {};
      for (const [sessionId, summary] of entries) {
        if (summary) {
          nextMap[sessionId] = summary;
        }
      }
      setSessionRunSummaryById(nextMap);
    };

    void loadRunSummary();
    return () => {
      cancelled = true;
    };
  }, [visibleGenerationHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hiddenKey = `project-hidden-sessions:${projectId}`;
    const rawHiddenMap = window.localStorage.getItem(hiddenKey);
    setHiddenSessionIds(
      readRecordFromStorage<Record<string, true>>(rawHiddenMap)
    );
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hiddenKey = `project-hidden-sessions:${projectId}`;
    window.localStorage.setItem(hiddenKey, JSON.stringify(hiddenSessionIds));
  }, [hiddenSessionIds, projectId]);

  const updateSessionInUrl = useCallback(
    (sessionId: string) => {
      const nextSearch = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      nextSearch.set("session", sessionId);
      router.replace(`/projects/${projectId}?${nextSearch.toString()}`, {
        scroll: false,
      });
    },
    [projectId, router]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem(PROJECT_THEME_STORAGE_KEY);
    setSelectedThemePreset(resolveProjectThemePreset(storedTheme));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PROJECT_THEME_STORAGE_KEY, selectedThemePreset);
  }, [selectedThemePreset]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      let token = TokenStorage.getAccessToken();
      if (!token && TokenStorage.getRefreshToken()) {
        const refreshed = await authService.refreshToken();
        if (cancelled) return;
        if (refreshed) {
          token = TokenStorage.getAccessToken();
        }
      }

      if (!token) {
        router.push("/auth/login");
        return;
      }

      await Promise.all([
        fetchProject(projectId),
        fetchFiles(projectId),
        fetchGenerationHistory(projectId),
      ]);

      if (cancelled) return;

      const history = useProjectStore.getState().generationHistory;
      if (history.length > 0) {
        return;
      }

      // Do not auto-create bootstrap sessions. Session creation should be explicit.
      setActiveSessionId(null);
      useProjectStore.setState({ generationSession: null });
      void fetchMessages(projectId, null);
      void fetchArtifactHistory(projectId, null);
    };

    void bootstrap().finally(() => {
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    });

    return () => {
      cancelled = true;
      reset();
    };
  }, [
    projectId,
    router,
    fetchProject,
    fetchFiles,
    fetchGenerationHistory,
    fetchMessages,
    fetchArtifactHistory,
    reset,
    setActiveSessionId,
    updateSessionInUrl,
  ]);

  useEffect(() => {
    const preferredSessionId = resolvePreferredSessionId(
      querySessionId,
      visibleGenerationHistory,
      activeSessionId
    );

    if (!preferredSessionId) {
      if (activeSessionId !== null) {
        setActiveSessionId(null);
      }
      useProjectStore.setState({ generationSession: null });
      void fetchMessages(projectId, null);
      void fetchArtifactHistory(projectId, null);
      return;
    }

    const nextSessionId = preferredSessionId;
    if (queryRunId && queryRunId !== activeRunId) {
      setActiveRunId(queryRunId);
    }

    if (nextSessionId && nextSessionId !== activeSessionId) {
      setActiveSessionId(nextSessionId);
      void fetchArtifactHistory(projectId, nextSessionId);
      void generateApi
        .getSessionSnapshot(nextSessionId, { run_id: queryRunId })
        .then((response) => {
          const nextRunId =
            queryRunId ||
            ((response?.data as { current_run?: { run_id?: string } } | null)
              ?.current_run?.run_id ??
              null);
          useProjectStore.setState({
            generationSession: response?.data ?? null,
            activeRunId: nextRunId,
          });
        })
        .catch(() => {
          useProjectStore.setState({ generationSession: null });
        });
    }

    if (nextSessionId) {
      void fetchMessages(projectId, nextSessionId);
    }

    if (
      nextSessionId &&
      nextSessionId === activeSessionId &&
      queryRunId &&
      queryRunId !== activeRunId
    ) {
      void generateApi
        .getSessionSnapshot(nextSessionId, { run_id: queryRunId })
        .then((response) => {
          useProjectStore.setState({
            generationSession: response?.data ?? null,
            activeRunId: queryRunId,
          });
        })
        .catch(() => {
          // keep current snapshot when run-scoped sync fails
        });
    }

    if (nextSessionId && querySessionId !== nextSessionId) {
      updateSessionInUrl(nextSessionId);
    }
  }, [
    visibleGenerationHistory,
    querySessionId,
    queryRunId,
    activeSessionId,
    activeRunId,
    fetchArtifactHistory,
    fetchMessages,
    projectId,
    setActiveRunId,
    setActiveSessionId,
    updateSessionInUrl,
  ]);

  const handleToolClick = async (_tool: GenerationTool) => {
    // Session lifecycle is controlled from the session switcher.
  };

  const handleChangeSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === "empty") return;
      setActiveSessionId(sessionId);
      updateSessionInUrl(sessionId);
      const [messagesResult, artifactsResult, sessionResult] =
        await Promise.allSettled([
          fetchMessages(projectId, sessionId),
          fetchArtifactHistory(projectId, sessionId),
          generateApi.getSession(sessionId),
        ]);
      if (sessionResult.status === "fulfilled") {
        useProjectStore.setState({
          generationSession: sessionResult.value?.data ?? null,
        });
      } else {
        useProjectStore.setState({ generationSession: null });
      }
      void messagesResult;
      void artifactsResult;
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
      setHiddenSessionIds((prev) => {
        if (!prev[newSessionId]) return prev;
        const next = { ...prev };
        delete next[newSessionId];
        return next;
      });

      await fetchGenerationHistory(projectId);
      await handleChangeSession(newSessionId);
      toast({
        title: "已创建交互会话",
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

  const handleRenameSession = useCallback(
    async (sessionId: string, nextTitle: string) => {
      const target = generationHistory.find((item) => item.id === sessionId);
      if (!target) return;

      const normalizedTitle = nextTitle.trim();
      if (!normalizedTitle) {
        toast({
          title: "会话名称不能为空",
          variant: "destructive",
        });
        return;
      }

      try {
        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "SET_SESSION_TITLE",
            display_title: normalizedTitle,
          } as never,
        });

        await fetchGenerationHistory(projectId);
        if (activeSessionId === sessionId) {
          const snapshot = await generateApi.getSessionSnapshot(sessionId, {
            run_id: activeRunId ?? undefined,
          });
          useProjectStore.setState({
            generationSession: snapshot?.data ?? null,
          });
        }

        toast({
          title: "会话名称已更新",
        });
      } catch (error) {
        toast({
          title: "会话名称更新失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
    },
    [
      activeRunId,
      activeSessionId,
      fetchGenerationHistory,
      generationHistory,
      projectId,
    ]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const target = generationHistory.find((item) => item.id === sessionId);
      if (!target) return;
      if (visibleGenerationHistory.length <= 1) {
        toast({
          title: "至少保留一个会话",
          description: "当前项目需要保留可用会话上下文",
          variant: "destructive",
        });
        return;
      }

      const remaining = visibleGenerationHistory.filter(
        (item) => item.id !== sessionId
      );
      setHiddenSessionIds((prev) => ({
        ...prev,
        [sessionId]: true,
      }));

      if (activeSessionId === sessionId && remaining.length > 0) {
        await handleChangeSession(remaining[0].id);
      }

      toast({
        title: "会话已隐藏",
      });
    },
    [
      activeSessionId,
      generationHistory,
      handleChangeSession,
      visibleGenerationHistory,
    ]
  );

  return {
    router,
    project,
    isLoading,
    isBootstrapping,
    projectId,
    isExpanded: panelLayout.isExpanded,
    expandedTool,
    sessionOptions,
    activeSessionId,
    isCreatingSession,
    isLibraryOpen,
    setIsLibraryOpen,
    selectedThemePreset,
    setSelectedThemePreset,
    panelAreaRef: panelLayout.panelAreaRef,
    studioWidth: panelLayout.studioWidth,
    chatWidth: panelLayout.chatWidth,
    expandedStudioWidth: panelLayout.expandedStudioWidth,
    expandedChatHeight: panelLayout.expandedChatHeight,
    handleToolClick,
    handleChangeSession,
    handleRenameSession,
    handleDeleteSession,
    handleCreateSession,
    handleMouseDown: panelLayout.handleMouseDown,
    sourcesWidthPercent: panelLayout.sourcesWidthPercent,
    isSourcesCollapsedByWidth: panelLayout.isSourcesCollapsedByWidth,
    toggleSourcesCollapsed: panelLayout.toggleSourcesCollapsed,
    isExpandedSourcesCollapsedByHeight:
      panelLayout.isExpandedSourcesCollapsedByHeight,
    handleToggleExpandedSources: panelLayout.handleToggleExpandedSources,
  };
}

