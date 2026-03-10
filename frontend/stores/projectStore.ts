import { create } from "zustand";
import type { components } from "@/lib/types/api";
import { projectsApi, filesApi, chatApi, generateApi, ragApi } from "@/lib/api";
import { ApiError, getErrorMessage } from "@/lib/api/errors";
import { toast } from "@/hooks/use-toast";

type Project = components["schemas"]["Project"];
type UploadedFile = components["schemas"]["UploadedFile"];
type Message = components["schemas"]["Message"];
type OutlineDocument = components["schemas"]["OutlineDocument"];
type GenerationOptions = components["schemas"]["GenerationOptions"];
type SessionStatePayload = components["schemas"]["SessionStatePayload"];
type SourceDetailResponse = components["schemas"]["SourceDetailResponse"];
type SourceDetail = SourceDetailResponse["data"];

export type LayoutMode = "normal" | "expanded";
export type ExpandedTool = "ppt" | "word" | "mindmap" | "outline" | "quiz" | "summary" | "animation" | "handout" | null;

export interface GenerationTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "ppt" | "word" | "mindmap" | "outline" | "quiz" | "summary" | "animation" | "handout";
}

export const GENERATION_TOOLS: GenerationTool[] = [
  { id: "ppt", name: "PPT 课件", description: "生成演示文稿", icon: "📊", type: "ppt" },
  { id: "word", name: "Word 文档", description: "生成文档资料", icon: "📄", type: "word" },
  { id: "mindmap", name: "思维导图", description: "生成知识图谱", icon: "🧠", type: "mindmap" },
  { id: "outline", name: "课程大纲", description: "生成课程大纲", icon: "📋", type: "outline" },
  { id: "quiz", name: "测验题库", description: "生成测验题目", icon: "❓", type: "quiz" },
  { id: "summary", name: "内容摘要", description: "生成内容摘要", icon: "📝", type: "summary" },
  { id: "animation", name: "动画素材", description: "生成动画资源", icon: "🎬", type: "animation" },
  { id: "handout", name: "讲义资料", description: "生成讲义文档", icon: "📖", type: "handout" },
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
  lastFailedInput: string | null;
  activeSourceDetail: SourceDetail | null;

  layoutMode: LayoutMode;
  expandedTool: ExpandedTool;

  isLoading: boolean;
  isSending: boolean;
  isUploading: boolean;
  error: ApiError | null;

  fetchProject: (projectId: string) => Promise<void>;
  fetchFiles: (projectId: string) => Promise<void>;
  fetchMessages: (projectId: string) => Promise<void>;
  uploadFile: (file: File, projectId: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  toggleFileSelection: (fileId: string) => void;
  sendMessage: (projectId: string, content: string) => Promise<void>;
  focusSourceByChunk: (chunkId: string, projectId: string) => Promise<void>;
  clearActiveSource: () => void;
  startGeneration: (projectId: string, tool: GenerationTool, options?: GenerationOptions) => Promise<void>;
  fetchGenerationHistory: (projectId: string) => Promise<void>;
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
  lastFailedInput: null as string | null,
  activeSourceDetail: null as SourceDetail | null,
  layoutMode: "normal" as LayoutMode,
  expandedTool: null as ExpandedTool,
  isLoading: false,
  isSending: false,
  isUploading: false,
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
      set({ error: { code: "FETCH_PROJECT_FAILED", message } });
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
        const currentFiles = get().files;
        set({ files: response.data.files });

        let hasPending = false;
        response.data.files.forEach((file) => {
          if (file.status === "ready") {
            const oldFile = currentFiles.find((f) => f.id === file.id);
            if (oldFile && oldFile.status !== "ready") {
              // Automatically index file for RAG when it becomes ready
              ragApi.indexFile({ file_id: file.id }).catch(console.error);
            }
          } else if (file.status === "parsing" || file.status === "uploading") {
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

  fetchMessages: async (projectId: string) => {
    try {
      const response = await chatApi.getMessages({ project_id: projectId, limit: 50 });
      set({ messages: response?.data?.messages ?? [] });
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取消息失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  uploadFile: async (file: File, projectId: string) => {
    set({ isUploading: true });
    try {
      await filesApi.uploadFile(file, projectId);
      await get().fetchFiles(projectId);
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: { code: "UPLOAD_FAILED", message } });
      toast({
        title: "文件上传失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      set({ isUploading: false });
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
      set({ error: { code: "DELETE_FILE_FAILED", message } });
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

  sendMessage: async (projectId: string, content: string) => {
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
      const response = await chatApi.sendMessage({
        project_id: projectId,
        content,
        rag_source_ids: selectedFileIds.length > 0 ? selectedFileIds : undefined,
      });

      if (response?.data?.message) {
        set((state) => ({
          messages: [...state.messages.slice(0, -1), userMessage, response.data!.message!],
        }));
      }
    } catch (error) {
      const message = getErrorMessage(error);
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId),
        lastFailedInput: content,
        error: { code: "SEND_MESSAGE_FAILED", message },
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
    }
  },

  clearActiveSource: () => set({ activeSourceDetail: null }),

  startGeneration: async (projectId: string, tool: GenerationTool, options?: GenerationOptions) => {
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
        output_type: (tool.type === "ppt" || tool.type === "mindmap" || tool.type === "outline" || tool.type === "animation") ? "ppt" : "word",
        options: {
          ...normalizedOptions,
          rag_source_ids: selectedFileIds.length > 0 ? selectedFileIds : undefined,
        },
      });

      if (response?.data?.session) {
        const sessionId = response.data.session.session_id;

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
        } catch (sessionError) {
          const message = getErrorMessage(sessionError);
          set((state) => ({
            generationSession: null,
            generationHistory: state.generationHistory.map((h) =>
              h.id === sessionId ? { ...h, status: "failed" as const } : h
            ),
            error: { code: "SESSION_FETCH_FAILED", message },
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
      set({ error: { code: "GENERATION_FAILED", message } });
      toast({
        title: "创建生成任务失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  fetchGenerationHistory: async (projectId: string) => {
    try {
      const response = await generateApi.listSessions({ project_id: projectId, limit: 20 });
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
      set({ generationHistory: history });
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: "获取最近生成失败",
        description: message,
        variant: "destructive",
      });
    }
  },
  updateOutline: async (sessionId: string, outline: OutlineDocument) => {
    const session = get().generationSession;
    const baseVersion = session?.outline?.version ?? 1;
    try {
      await generateApi.updateOutline(sessionId, {
        base_version: baseVersion,
        outline
      });
      const sessionResponse = await generateApi.getSession(sessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: { code: "UPDATE_OUTLINE_FAILED", message } });
      toast({
        title: "更新大纲失败",
        description: message,
        variant: "destructive",
      });
    }
  },

  confirmOutline: async (sessionId: string) => {
    try {
      await generateApi.confirmOutline(sessionId, { continue_from_retrieval: true });
      const sessionResponse = await generateApi.getSession(sessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: { code: "CONFIRM_OUTLINE_FAILED", message } });
      toast({
        title: "确认大纲失败",
        description: message,
        variant: "destructive",
      });
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
        error: { code: "UPDATE_PROJECT_FAILED", message },
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
