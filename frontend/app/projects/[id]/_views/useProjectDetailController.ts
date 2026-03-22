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
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      isLoading: state.isLoading,
      layoutMode: state.layoutMode,
      fetchProject: state.fetchProject,
      fetchFiles: state.fetchFiles,
      fetchMessages: state.fetchMessages,
      fetchGenerationHistory: state.fetchGenerationHistory,
      fetchArtifactHistory: state.fetchArtifactHistory,
      setActiveSessionId: state.setActiveSessionId,
      generationHistory: state.generationHistory,
      activeSessionId: state.activeSessionId,
      reset: state.reset,
    }))
  );

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [selectedThemePreset, setSelectedThemePreset] = useState<ThemePresetId>(
    DEFAULT_PROJECT_THEME_PRESET
  );

  const panelLayout = useProjectPanelLayout({ layoutMode, isLoading });

  const sessionOptions: SessionSwitcherItem[] = useMemo(
    () =>
      generationHistory.map((item) => ({
        sessionId: item.id,
        title: (item.title || "").trim() || `会话 ${item.id.slice(-6)}`,
        updatedAt: formatSessionTime(item.createdAt),
      })),
    [generationHistory]
  );

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

      const response = await generateApi.createSession({
        project_id: projectId,
        output_type: "both",
        bootstrap_only: true,
      });
      const bootstrapSessionId = response.data?.session?.session_id;
      if (!bootstrapSessionId || cancelled) return;

      setActiveSessionId(bootstrapSessionId);
      const currentSessionInUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("session")
          : null;
      if (currentSessionInUrl !== bootstrapSessionId) {
        updateSessionInUrl(bootstrapSessionId);
      }
      await fetchGenerationHistory(projectId);
      const [, , sessionResponse] = await Promise.all([
        fetchMessages(projectId, bootstrapSessionId),
        fetchArtifactHistory(projectId, bootstrapSessionId),
        generateApi.getSession(bootstrapSessionId),
      ]);
      useProjectStore.setState({
        generationSession: sessionResponse?.data ?? null,
      });
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
      generationHistory,
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

    if (nextSessionId && nextSessionId !== activeSessionId) {
      setActiveSessionId(nextSessionId);
      void fetchArtifactHistory(projectId, nextSessionId);
      void generateApi
        .getSession(nextSessionId)
        .then((response) => {
          useProjectStore.setState({
            generationSession: response?.data ?? null,
          });
        })
        .catch(() => {
          useProjectStore.setState({ generationSession: null });
        });
    }

    if (nextSessionId) {
      void fetchMessages(projectId, nextSessionId);
    }

    if (nextSessionId && querySessionId !== nextSessionId) {
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

  const handleToolClick = async (_tool: GenerationTool) => {
    // Session is created when user starts generation from config panel.
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

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      const target = generationHistory.find((item) => item.id === sessionId);
      if (!target) return;

      const fallbackTitle = `会话 ${sessionId.slice(-6)}`;
      const currentTitle = (target.title || "").trim() || fallbackTitle;
      const nextTitle = window.prompt("请输入会话名称", currentTitle);
      if (nextTitle === null) return;

      const normalizedTitle = nextTitle.trim();
      if (!normalizedTitle) {
        toast({
          title: "会话名称不能为空",
          variant: "destructive",
        });
        return;
      }

      useProjectStore.setState((state) => ({
        generationHistory: state.generationHistory.map((item) =>
          item.id === sessionId ? { ...item, title: normalizedTitle } : item
        ),
      }));
      toast({
        title: "会话名称已更新",
      });
    },
    [generationHistory]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const target = generationHistory.find((item) => item.id === sessionId);
      if (!target) return;
      if (generationHistory.length <= 1) {
        toast({
          title: "至少保留一个会话",
          description: "当前项目需要保留可用会话上下文",
          variant: "destructive",
        });
        return;
      }

      const title = (target.title || "").trim() || `会话 ${sessionId.slice(-6)}`;
      const confirmed = window.confirm(`确认删除「${title}」吗？`);
      if (!confirmed) return;

      const remaining = generationHistory.filter((item) => item.id !== sessionId);
      useProjectStore.setState((state) => ({
        generationHistory: state.generationHistory.filter(
          (item) => item.id !== sessionId
        ),
      }));

      if (activeSessionId === sessionId && remaining.length > 0) {
        await handleChangeSession(remaining[0].id);
      }

      toast({
        title: "会话已删除",
      });
    },
    [activeSessionId, generationHistory, handleChangeSession]
  );

  return {
    router,
    project,
    isLoading,
    isBootstrapping,
    projectId,
    isExpanded: panelLayout.isExpanded,
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
