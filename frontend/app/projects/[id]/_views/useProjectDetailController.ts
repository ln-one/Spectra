import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/lib/auth";
import { generateApi, projectSpaceApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import { useProjectStore, type GenerationTool } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import type { SessionSwitcherItem, ThemePresetId } from "@/components/project";
import type { ProjectReference } from "@/components/project/features/library/types";
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

const SESSION_CHECK_TIMEOUT_MS = 8_000;
const PROJECT_BOOTSTRAP_TIMEOUT_MS = 12_000;
const TITLE_POLL_INTERVAL_MS = 2_500;

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout?.();
          reject(new Error("PROJECT_BOOTSTRAP_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

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
  if (runStatus === "processing") {
    if (runStep === "outline" || runStep === "generate") return "课件生成中";
    if (runStep === "preview") return "单页可预览";
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

function extractCurrentRunId(
  payload: { current_run?: { run_id?: string } } | null | undefined
): string | null {
  const runId = payload?.current_run?.run_id;
  return typeof runId === "string" && runId.trim() ? runId : null;
}

function readProjectNameSource(
  project:
    | ({ nameSource?: string; name_source?: string } & Record<string, unknown>)
    | null
    | undefined
): string {
  return String(project?.nameSource || project?.name_source || "").trim();
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
  const [activeReferences, setActiveReferences] = useState<ProjectReference[]>(
    []
  );
  const consumedQueryRunKeysRef = useRef<Set<string>>(new Set());
  const lastFetchedMessagesSessionRef = useRef<string | null>(null);

  useEffect(() => {
    consumedQueryRunKeysRef.current.clear();
    lastFetchedMessagesSessionRef.current = null;
  }, [projectId]);

  const panelLayout = useProjectPanelLayout({ layoutMode, isLoading });

  const loadActiveReferences = useCallback(async () => {
    try {
      const response = await projectSpaceApi.getReferences(projectId);
      const references = (response.references ?? [])
        .filter((reference) => reference.status === "active")
        .sort((a, b) => {
          if (a.relationType !== b.relationType) {
            return a.relationType === "base" ? -1 : 1;
          }
          return (a.priority ?? 999) - (b.priority ?? 999);
        });
      setActiveReferences(references);
    } catch {
      setActiveReferences([]);
    }
  }, [projectId]);

  const handleReferencesChanged = useCallback(() => {
    void loadActiveReferences();
  }, [loadActiveReferences]);

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
      let hasPendingRunTitles = false;
      const entries = await Promise.all(
        visibleGenerationHistory.map(async (item) => {
          try {
            const response = await generateApi.listRuns(item.id, { limit: 2 });
            const runs = response?.data?.runs ?? [];
            const latestRun = runs[0];
            if (!latestRun) return [item.id, null] as const;
            if (latestRun.run_title_source === "pending") {
              hasPendingRunTitles = true;
            }
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
      if (hasPendingRunTitles) {
        window.setTimeout(() => {
          void loadRunSummary();
        }, TITLE_POLL_INTERVAL_MS);
      }
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
    (sessionId: string, runId?: string | null) => {
      const nextSearch = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      nextSearch.set("session", sessionId);
      const normalizedRunId = String(runId || "").trim();
      if (normalizedRunId) {
        nextSearch.set("run", normalizedRunId);
      } else {
        nextSearch.delete("run");
      }
      router.replace(`/projects/${projectId}?${nextSearch.toString()}`, {
        scroll: false,
      });
    },
    [projectId, router]
  );

  const loadSessionSnapshot = useCallback(
    async (sessionId: string, runId?: string | null) => {
      const normalizedRunId = String(runId || "").trim();
      const response = normalizedRunId
        ? await generateApi.getSessionByRun(sessionId, {
            run_id: normalizedRunId,
          })
        : await generateApi.getSession(sessionId);
      const snapshot = response?.data ?? null;
      return {
        snapshot,
        runId:
          extractCurrentRunId(
            snapshot as { current_run?: { run_id?: string } } | null
          ) ||
          normalizedRunId ||
          null,
      };
    },
    []
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
      reset();
      setIsBootstrapping(true);
      const hasSession = await authService.hasActiveSession({
        timeoutMs: SESSION_CHECK_TIMEOUT_MS,
      });
      if (!hasSession) {
        useProjectStore.setState({ isLoading: false });
        router.replace("/auth/login");
        return;
      }

      await Promise.allSettled([
        withTimeout(
          fetchProject(projectId),
          PROJECT_BOOTSTRAP_TIMEOUT_MS,
          () => {
            useProjectStore.setState({ isLoading: false });
          }
        ),
        withTimeout(fetchFiles(projectId), PROJECT_BOOTSTRAP_TIMEOUT_MS),
        withTimeout(
          fetchGenerationHistory(projectId),
          PROJECT_BOOTSTRAP_TIMEOUT_MS
        ),
        withTimeout(loadActiveReferences(), PROJECT_BOOTSTRAP_TIMEOUT_MS),
      ]);

      if (cancelled) return;

      const currentProject = useProjectStore.getState().project;
      if (!currentProject || currentProject.id !== projectId) {
        setActiveSessionId(null);
        useProjectStore.setState({
          generationSession: null,
          activeRunId: null,
        });
        router.replace("/projects");
        return;
      }

      const history = useProjectStore.getState().generationHistory;
      if (history.length > 0) {
        return;
      }

      // Do not auto-create bootstrap sessions. Session creation should be explicit.
      setActiveSessionId(null);
      useProjectStore.setState({ generationSession: null });
      lastFetchedMessagesSessionRef.current = null;
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
    };
  }, [
    projectId,
    router,
    fetchProject,
    fetchFiles,
    fetchGenerationHistory,
    fetchMessages,
    fetchArtifactHistory,
    loadActiveReferences,
    reset,
    setActiveSessionId,
    updateSessionInUrl,
  ]);

  useEffect(() => {
    if (!project || project.id !== projectId) return;
    if (readProjectNameSource(project as Record<string, unknown>) !== "default") {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchProject(projectId, { silent: true });
    }, TITLE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [fetchProject, project, projectId]);

  useEffect(() => {
    const hasPendingSessionTitles = visibleGenerationHistory.some(
      (item) => item.titleSource === "default"
    );
    if (!hasPendingSessionTitles) return;

    const timer = window.setInterval(() => {
      void fetchGenerationHistory(projectId);
    }, TITLE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [fetchGenerationHistory, projectId, visibleGenerationHistory]);

  useEffect(() => {
    let cancelled = false;
    if (!project || project.id !== projectId) {
      return;
    }
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
      lastFetchedMessagesSessionRef.current = null;
      void fetchMessages(projectId, null);
      void fetchArtifactHistory(projectId, null);
      return;
    }

    const nextSessionId = preferredSessionId;
    const normalizedQueryRunId = String(queryRunId ?? "").trim();
    const queryRunKey = normalizedQueryRunId
      ? `${nextSessionId}:${normalizedQueryRunId}`
      : "";
    const canConsumeQueryRunIntent =
      Boolean(queryRunKey) && !consumedQueryRunKeysRef.current.has(queryRunKey);
    const consumeQueryRunIntent = () => {
      if (!queryRunKey) return;
      consumedQueryRunKeysRef.current.add(queryRunKey);
    };

    if (nextSessionId && nextSessionId !== activeSessionId) {
      setActiveSessionId(nextSessionId);
      void fetchArtifactHistory(projectId, nextSessionId);
      if (canConsumeQueryRunIntent) {
        consumeQueryRunIntent();
      }
      const bootstrapRunId = canConsumeQueryRunIntent
        ? normalizedQueryRunId
        : null;
      void (async () => {
        try {
          const { snapshot, runId } = await loadSessionSnapshot(
            nextSessionId,
            bootstrapRunId
          );
          if (cancelled) return;
          useProjectStore.setState({
            generationSession: snapshot,
            activeRunId: runId,
          });
        } catch {
          if (cancelled) return;
          useProjectStore.setState({
            generationSession: null,
            activeRunId: null,
          });
        }
      })();
    }

    if (
      nextSessionId &&
      lastFetchedMessagesSessionRef.current !== nextSessionId
    ) {
      lastFetchedMessagesSessionRef.current = nextSessionId;
      void fetchMessages(projectId, nextSessionId);
    }

    if (nextSessionId && nextSessionId === activeSessionId && activeRunId) {
      if (queryRunId !== activeRunId) updateSessionInUrl(nextSessionId, activeRunId);
    } else if (
      nextSessionId &&
      nextSessionId === activeSessionId &&
      canConsumeQueryRunIntent
    ) {
      consumeQueryRunIntent();
      void (async () => {
        try {
          const { snapshot, runId } = await loadSessionSnapshot(
            nextSessionId,
            normalizedQueryRunId
          );
          if (cancelled) return;
          useProjectStore.setState({
            generationSession: snapshot,
            activeRunId: runId,
          });
        } catch {
          // Keep current snapshot when run-scoped sync fails.
        }
      })();
    }

    if (nextSessionId && querySessionId !== nextSessionId) {
      updateSessionInUrl(nextSessionId, null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    visibleGenerationHistory,
    querySessionId,
    queryRunId,
    activeSessionId,
    activeRunId,
    fetchArtifactHistory,
    fetchMessages,
    loadSessionSnapshot,
    project,
    projectId,
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
      lastFetchedMessagesSessionRef.current = sessionId;
      updateSessionInUrl(sessionId, null);
      const [messagesResult, artifactsResult, sessionResult] =
        await Promise.allSettled([
          fetchMessages(projectId, sessionId),
          fetchArtifactHistory(projectId, sessionId),
          generateApi.getSession(sessionId),
        ]);
      if (sessionResult.status === "fulfilled") {
        const sessionSnapshot = sessionResult.value?.data ?? null;
        useProjectStore.setState({
          generationSession: sessionSnapshot,
          activeRunId: extractCurrentRunId(
            (sessionSnapshot as { current_run?: { run_id?: string } } | null) ??
              null
          ),
        });
      } else {
        useProjectStore.setState({
          generationSession: null,
          activeRunId: null,
        });
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
          const snapshot = await generateApi.getSession(sessionId);
          useProjectStore.setState({
            generationSession: snapshot?.data ?? null,
            activeRunId: extractCurrentRunId(
              (snapshot?.data as {
                current_run?: { run_id?: string };
              } | null) ?? null
            ),
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
    [activeSessionId, fetchGenerationHistory, generationHistory, projectId]
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
    activeReferences,
    handleReferencesChanged,
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

