import { create } from "zustand";
import type { components as sdkComponents } from "@/lib/sdk/types";
import {
  projectsApi,
  filesApi,
  chatApi,
  generateApi,
  ragApi,
  previewApi,
  projectSpaceApi,
} from "@/lib/sdk";
import {
  ApiErrorShape,
  createApiError,
  getErrorMessage,
} from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  groupArtifactsByTool,
  type ArtifactHistoryByTool,
  type ArtifactHistoryItem,
} from "@/lib/project-space/artifact-history";

type Project = sdkComponents["schemas"]["Project"];
type UploadedFile = sdkComponents["schemas"]["UploadedFile"];
type Message = sdkComponents["schemas"]["Message"];
type OutlineDocument = sdkComponents["schemas"]["OutlineDocument"];
type GenerationOptions = sdkComponents["schemas"]["GenerationOptions"];
type SessionStatePayload = sdkComponents["schemas"]["SessionStatePayload"];
type SourceDetailResponse = sdkComponents["schemas"]["SourceDetailResponse"];
type SourceDetail = SourceDetailResponse["data"];
type Artifact = sdkComponents["schemas"]["Artifact"];

export type LayoutMode = "normal" | "expanded";
export type ExpandedTool =
  | "ppt"
  | "word"
  | "mindmap"
  | "outline"
  | "quiz"
  | "summary"
  | "animation"
  | "handout"
  | null;

export interface GenerationTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  type:
    | "ppt"
    | "word"
    | "mindmap"
    | "outline"
    | "quiz"
    | "summary"
    | "animation"
    | "handout";
}

export const GENERATION_TOOLS: GenerationTool[] = [
  {
    id: "ppt",
    name: "课件生成",
    description: "自动生成结构化课件页面与讲解节奏",
    icon: "📊",
    type: "ppt",
  },
  {
    id: "word",
    name: "文档生成",
    description: "输出教案、讲稿与课堂文档资料",
    icon: "📄",
    type: "word",
  },
  {
    id: "mindmap",
    name: "思维导图",
    description: "提炼知识结构与章节关系图谱",
    icon: "🧠",
    type: "mindmap",
  },
  {
    id: "outline",
    name: "互动游戏",
    description: "生成课堂互动游戏与规则流程",
    icon: "🎮",
    type: "outline",
  },
  {
    id: "quiz",
    name: "随堂小测",
    description: "快速生成课中测验题与答案解析",
    icon: "❓",
    type: "quiz",
  },
  {
    id: "summary",
    name: "说课助手",
    description: "生成讲解提示、追问建议与板书要点",
    icon: "🎓",
    type: "summary",
  },
  {
    id: "animation",
    name: "演示动画",
    description: "生成演示动效脚本与动画分镜建议",
    icon: "🎬",
    type: "animation",
  },
  {
    id: "handout",
    name: "学情预演",
    description: "预演课堂反馈与学生掌握情况变化",
    icon: "📈",
    type: "handout",
  },
];

export interface GenerationHistory {
  id: string;
  toolId: string;
  toolName: string;
  status: "completed" | "failed" | "processing" | "pending";
  sessionState?: string;
  createdAt: string;
  title: string;
}

interface ProjectState {
  project: Project | null;
  files: UploadedFile[];
  messages: Message[];
  selectedFileIds: string[];
  generationSession: SessionStatePayload | null;
  generationHistory: GenerationHistory[];
  artifactHistoryByTool: ArtifactHistoryByTool;
  currentSessionArtifacts: ArtifactHistoryItem[];
  activeSessionId: string | null;
  lastFailedInput: string | null;
  activeSourceDetail: SourceDetail | null;

  layoutMode: LayoutMode;
  expandedTool: ExpandedTool;

  isLoading: boolean;
  isMessagesLoading: boolean;
  isSending: boolean;
  isUploading: boolean;
  uploadingCount: number;
  error: ApiErrorShape | null;

  fetchProject: (projectId: string) => Promise<void>;
  fetchFiles: (projectId: string) => Promise<void>;
  fetchMessages: (
    projectId: string,
    sessionId?: string | null
  ) => Promise<void>;
  uploadFile: (
    file: File,
    projectId: string,
    options?: { onProgress?: (progress: number) => void }
  ) => Promise<UploadedFile | void>;
  deleteFile: (fileId: string) => Promise<void>;
  toggleFileSelection: (fileId: string) => void;
  sendMessage: (
    projectId: string,
    content: string,
    sessionId?: string | null
  ) => Promise<void>;
  focusSourceByChunk: (chunkId: string, projectId: string) => Promise<void>;
  clearActiveSource: () => void;
  startGeneration: (
    projectId: string,
    tool: GenerationTool,
    options?: GenerationOptions
  ) => Promise<void>;
  fetchGenerationHistory: (projectId: string) => Promise<void>;
  fetchArtifactHistory: (
    projectId: string,
    sessionId?: string | null
  ) => Promise<void>;
  exportArtifact: (artifactId: string) => Promise<void>;
  setActiveSessionId: (sessionId: string | null) => void;
  updateOutline: (sessionId: string, outline: OutlineDocument) => Promise<void>;
  confirmOutline: (sessionId: string) => Promise<void>;
  updateProjectName: (name: string) => Promise<void>;
  setLayoutMode: (mode: LayoutMode) => void;
  setExpandedTool: (tool: ExpandedTool) => void;
  clearLastFailedInput: () => void;
  reset: () => void;
}

const initialState = {
  project: null,
  files: [],
  messages: [],
  selectedFileIds: [],
  generationSession: null,
  generationHistory: [],
  artifactHistoryByTool: groupArtifactsByTool([]),
  currentSessionArtifacts: [],
  activeSessionId: null as string | null,
  lastFailedInput: null as string | null,
  activeSourceDetail: null as SourceDetail | null,
  layoutMode: "normal" as LayoutMode,
  expandedTool: null as ExpandedTool,
  isLoading: false,
  isMessagesLoading: false,
  isSending: false,
  isUploading: false,
  uploadingCount: 0,
  error: null,
};

export const useProjectStore = create<ProjectState>()((set, get) => ({
  ...initialState,

  fetchProject: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await projectsApi.getProject(projectId);
      set({ project: response?.data?.project ?? null });
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        error: createApiError({ code: "FETCH_PROJECT_FAILED", message }),
      });
      toast({
        title: "获取项目失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFiles: async (projectId: string) => {
    try {
      const response = await filesApi.getProjectFiles(projectId);
      if (response?.data?.files) {
        set({ files: response.data.files });

        let hasPending = false;
        response.data.files.forEach((file) => {
          if (file.status === "parsing" || file.status === "uploading") {
            hasPending = true;
          }
        });

        // 轮询检查解析状态
        if (hasPending) {
          setTimeout(() => {
            get().fetchFiles(projectId);
          }, 3000);
        }
      }
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取文件列表失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  fetchMessages: async (projectId: string, sessionId?: string | null) => {
    set({ isMessagesLoading: true });
    try {
      const effectiveSessionId =
        sessionId ?? get().activeSessionId ?? undefined;
      const response = await chatApi.getMessages({
        project_id: projectId,
        session_id: effectiveSessionId,
        limit: 50,
      });
      set({ messages: response?.data?.messages ?? [] });
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取消息失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  uploadFile: async (file: File, projectId: string, options) => {
    set((state) => {
      const nextUploadingCount = state.uploadingCount + 1;
      return {
        uploadingCount: nextUploadingCount,
        isUploading: nextUploadingCount > 0,
      };
    });
    try {
      const activeSessionId = get().activeSessionId ?? undefined;
      const response = await filesApi.uploadFile(
        file,
        projectId,
        options?.onProgress,
        activeSessionId
      );
      await get().fetchFiles(projectId);
      return response?.data?.file;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: createApiError({ code: "UPLOAD_FAILED", message }) });
      throw error;
    } finally {
      set((state) => {
        const nextUploadingCount = Math.max(0, state.uploadingCount - 1);
        return {
          uploadingCount: nextUploadingCount,
          isUploading: nextUploadingCount > 0,
        };
      });
    }
  },

  deleteFile: async (fileId: string) => {
    try {
      await filesApi.deleteFile(fileId);
      set((state) => ({
        files: state.files.filter((f) => f.id !== fileId),
        selectedFileIds: state.selectedFileIds.filter((id) => id !== fileId),
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: createApiError({ code: "DELETE_FILE_FAILED", message }) });
      toast({
        title: "删除文件失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  toggleFileSelection: (fileId: string) => {
    set((state) => ({
      selectedFileIds: state.selectedFileIds.includes(fileId)
        ? state.selectedFileIds.filter((id) => id !== fileId)
        : [...state.selectedFileIds, fileId],
    }));
  },

  sendMessage: async (
    projectId: string,
    content: string,
    sessionId?: string | null
  ) => {
    if (!content.trim()) return;
    set({ isSending: true, lastFailedInput: null });
    const tempId = `temp-${Date.now()}`;
    try {
      const userMessage: Message = {
        id: tempId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, userMessage] }));

      const { selectedFileIds } = get();
      const effectiveSessionId =
        sessionId ?? get().activeSessionId ?? undefined;
      const response = await chatApi.sendMessage({
        project_id: projectId,
        session_id: effectiveSessionId,
        content,
        rag_source_ids:
          selectedFileIds.length > 0 ? selectedFileIds : undefined,
      });

      if (
        response?.data?.session_id &&
        response.data.session_id !== get().activeSessionId
      ) {
        set({ activeSessionId: response.data.session_id });
      }

      if (response?.data?.message) {
        set((state) => ({
          messages: [
            ...state.messages.slice(0, -1),
            userMessage,
            response.data!.message!,
          ],
        }));
      }
    } catch (error) {
      const message = getErrorMessage(error);
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId),
        lastFailedInput: content,
        error: createApiError({ code: "SEND_MESSAGE_FAILED", message }),
      }));
      toast({
        title: "发送消息失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      set({ isSending: false });
    }
  },

  focusSourceByChunk: async (chunkId: string, projectId: string) => {
    try {
      const response = await ragApi.getSourceDetail(chunkId, projectId);
      const detail = response?.data ?? null;
      set({ activeSourceDetail: detail });
      const fileId = detail?.file_info?.id;
      if (fileId) {
        set((state) => ({
          selectedFileIds: state.selectedFileIds.includes(fileId)
            ? state.selectedFileIds
            : [...state.selectedFileIds, fileId],
        }));
      } else {
        await get().fetchFiles(projectId);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取来源详情失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  clearActiveSource: () => set({ activeSourceDetail: null }),

  startGeneration: async (
    projectId: string,
    tool: GenerationTool,
    options?: GenerationOptions
  ) => {
    try {
      const { selectedFileIds } = get();
      const normalizedOptions: GenerationOptions = {
        template: options?.template || "default",
        show_page_number: options?.show_page_number ?? true,
        include_animations: options?.include_animations ?? false,
        include_games: options?.include_games ?? false,
        use_text_to_image: options?.use_text_to_image ?? false,
        ...options,
      };
      const response = await generateApi.createSession({
        project_id: projectId,
        output_type:
          tool.type === "ppt" ||
          tool.type === "mindmap" ||
          tool.type === "outline" ||
          tool.type === "animation"
            ? "ppt"
            : "word",
        options: {
          ...normalizedOptions,
          rag_source_ids:
            selectedFileIds.length > 0 ? selectedFileIds : undefined,
        },
      });

      if (response?.data?.session) {
        const sessionId = response.data.session.session_id;
        set({ activeSessionId: sessionId });

        const historyItem: GenerationHistory = {
          id: sessionId,
          toolId: tool.id,
          toolName: tool.name,
          status: "processing",
          sessionState: "CONFIGURING",
          createdAt: new Date().toISOString(),
          title: tool.name,
        };
        set((state) => ({
          generationHistory: [historyItem, ...state.generationHistory],
        }));

        try {
          const sessionResponse = await generateApi.getSession(sessionId);
          set({ generationSession: sessionResponse?.data ?? null });
          await get().fetchArtifactHistory(projectId, sessionId);
        } catch (sessionError) {
          const message = getErrorMessage(sessionError);
          set((state) => ({
            generationSession: null,
            generationHistory: state.generationHistory.map((h) =>
              h.id === sessionId ? { ...h, status: "failed" as const } : h
            ),
            error: createApiError({ code: "SESSION_FETCH_FAILED", message }),
          }));
          toast({
            title: "获取会话状态失败",
            description: message,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: createApiError({ code: "GENERATION_FAILED", message }) });
      toast({
        title: "创建生成任务失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  fetchGenerationHistory: async (projectId: string) => {
    try {
      const response = await generateApi.listSessions({
        project_id: projectId,
        limit: 20,
      });
      const sessions = response?.data?.sessions ?? [];
      const history: GenerationHistory[] = sessions.map((s) => {
        let status: GenerationHistory["status"] = "processing";
        if (s.state === "SUCCESS") status = "completed";
        else if (s.state === "FAILED") status = "failed";
        else if (s.state === "IDLE") status = "pending";

        const toolId =
          s.output_type === "ppt"
            ? "ppt"
            : s.output_type === "word"
              ? "word"
              : "ppt";
        const tool = GENERATION_TOOLS.find((t) => t.id === toolId);

        return {
          id: s.session_id,
          toolId: toolId,
          toolName: tool?.name || "生成任务",
          status,
          sessionState: s.state,
          createdAt: s.created_at,
          title: tool?.name || "生成任务",
        };
      });
      const activeSessionId =
        get().activeSessionId ??
        get().generationSession?.session?.session_id ??
        (history.length > 0 ? history[0].id : null);
      set({ generationHistory: history, activeSessionId });
      await get().fetchArtifactHistory(projectId, activeSessionId);
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取最近生成失败",
        description: message,
        variant: "destructive",
      });
    }
  },
  fetchArtifactHistory: async (
    projectId: string,
    sessionId?: string | null
  ) => {
    try {
      const response = await projectSpaceApi.getArtifacts(projectId);
      const artifacts = ((response?.data?.artifacts ?? []) as Artifact[]) || [];
      const effectiveSessionId =
        sessionId ??
        get().activeSessionId ??
        get().generationSession?.session?.session_id ??
        null;
      const artifactHistoryByTool = groupArtifactsByTool(
        artifacts,
        effectiveSessionId
      );
      const currentSessionArtifacts = Object.values(artifactHistoryByTool)
        .flat()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      set({ artifactHistoryByTool, currentSessionArtifacts });
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取成果历史失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  exportArtifact: async (artifactId: string) => {
    const artifact = get().currentSessionArtifacts.find(
      (item) => item.artifactId === artifactId
    );
    if (!artifact) {
      toast({
        title: "导出失败",
        description: "未找到对应成果",
        variant: "destructive",
      });
      return;
    }

    if (artifact.storagePath) {
      window.open(artifact.storagePath, "_blank", "noopener,noreferrer");
      return;
    }

    const sessionId =
      artifact.sessionId ??
      get().activeSessionId ??
      get().generationSession?.session?.session_id ??
      null;
    if (!sessionId) {
      toast({
        title: "导出失败",
        description: "缺少会话上下文，无法导出",
        variant: "destructive",
      });
      return;
    }

    try {
      const format =
        artifact.toolType === "summary" || artifact.toolType === "outline"
          ? "markdown"
          : "json";
      const response = await previewApi.exportSessionPreview(sessionId, {
        artifact_id: artifact.artifactId,
        format,
        include_sources: true,
      });
      const content = response?.data?.content ?? "";
      if (!content) {
        toast({
          title: "导出失败",
          description: "服务端未返回可下载内容",
          variant: "destructive",
        });
        return;
      }
      const blob = new Blob([content], {
        type:
          format === "markdown"
            ? "text/markdown;charset=utf-8"
            : "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const ext = format === "markdown" ? "md" : "json";
      const link = document.createElement("a");
      link.href = url;
      link.download = `${artifact.toolType}-${artifact.artifactId.slice(0, 8)}.${ext}`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "导出成功",
        description: "文件已开始下载",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "导出失败",
        description: message,
        variant: "destructive",
      });
    }
  },
  setActiveSessionId: (sessionId: string | null) =>
    set({ activeSessionId: sessionId }),
  updateOutline: async (sessionId: string, outline: OutlineDocument) => {
    const session = get().generationSession;
    const baseVersion = session?.outline?.version ?? 1;
    try {
      await generateApi.updateOutline(sessionId, {
        base_version: baseVersion,
        outline,
      });
      const sessionResponse = await generateApi.getSession(sessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        error: createApiError({ code: "UPDATE_OUTLINE_FAILED", message }),
      });
      toast({
        title: "更新大纲失败",
        description: message,
        variant: "destructive",
      });
      throw error;
    }
  },

  confirmOutline: async (sessionId: string) => {
    try {
      await generateApi.confirmOutline(sessionId, {
        continue_from_retrieval: true,
      });
      const sessionResponse = await generateApi.getSession(sessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        error: createApiError({ code: "CONFIRM_OUTLINE_FAILED", message }),
      });
      toast({
        title: "确认大纲失败",
        description: message,
        variant: "destructive",
      });
      throw error;
    }
  },

  updateProjectName: async (name: string) => {
    const { project } = get();
    if (!project) return;

    const oldName = project.name;
    set((state) => ({
      project: state.project ? { ...state.project, name } : null,
    }));

    try {
      await projectsApi.updateProject(project.id, {
        name,
        description: project.description,
        grade_level: project.grade_level,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      set((state) => ({
        project: state.project ? { ...state.project, name: oldName } : null,
        error: createApiError({ code: "UPDATE_PROJECT_FAILED", message }),
      }));
      toast({
        title: "更新项目名称失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  setLayoutMode: (mode: LayoutMode) => set({ layoutMode: mode }),
  setExpandedTool: (tool: ExpandedTool) => set({ expandedTool: tool }),
  clearLastFailedInput: () => set({ lastFailedInput: null }),
  reset: () => set(initialState),
}));
