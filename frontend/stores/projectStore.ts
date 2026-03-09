import { create } from "zustand";
import type { components } from "@/lib/types/api";
import { projectsApi, filesApi, chatApi, generateApi } from "@/lib/api";
import { ApiError, getErrorMessage } from "@/lib/api/errors";

type Project = components["schemas"]["Project"];
type UploadedFile = components["schemas"]["UploadedFile"];
type Message = components["schemas"]["Message"];
type GenerationState = components["schemas"]["GenerationState"];
type OutlineDocument = components["schemas"]["OutlineDocument"];
type GenerationOptions = components["schemas"]["GenerationOptions"];
type SessionStatePayload = components["schemas"]["SessionStatePayload"];

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
  status: "completed" | "failed" | "processing";
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
  startGeneration: (projectId: string, tool: GenerationTool, options?: GenerationOptions) => Promise<void>;
  confirmOutline: (sessionId: string) => Promise<void>;
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
      set({ error: { code: "FETCH_PROJECT_FAILED", message: getErrorMessage(error) } });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFiles: async (projectId: string) => {
    try {
      const response = await filesApi.getProjectFiles(projectId);
      set({ files: response?.data?.files ?? [] });
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  },

  fetchMessages: async (projectId: string) => {
    try {
      const response = await chatApi.getMessages({ project_id: projectId, limit: 50 });
      set({ messages: response?.data?.messages ?? [] });
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  },

  uploadFile: async (file: File, projectId: string) => {
    set({ isUploading: true });
    try {
      await filesApi.uploadFile(file, projectId);
      await get().fetchFiles(projectId);
    } catch (error) {
      set({ error: { code: "UPLOAD_FAILED", message: getErrorMessage(error) } });
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
      set({ error: { code: "DELETE_FILE_FAILED", message: getErrorMessage(error) } });
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

      const response = await chatApi.sendMessage({
        project_id: projectId,
        content,
      });

      if (response?.data?.message) {
        set((state) => ({
          messages: [...state.messages.slice(0, -1), userMessage, response.data!.message!],
        }));
      }
    } catch (error) {
      // 回滚乐观更新：移除临时消息，并保留用户输入
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId),
        lastFailedInput: content,
        error: { code: "SEND_MESSAGE_FAILED", message: getErrorMessage(error) },
      }));
    } finally {
      set({ isSending: false });
    }
  },

  startGeneration: async (projectId: string, tool: GenerationTool, options?: GenerationOptions) => {
    try {
      const response = await generateApi.createSession({
        project_id: projectId,
        output_type: tool.type === "mindmap" || tool.type === "outline" ? "ppt" : tool.type,
        options,
      });

      if (response?.data?.session) {
        const sessionId = response.data.session.session_id;

        const historyItem: GenerationHistory = {
          id: sessionId,
          toolId: tool.id,
          toolName: tool.name,
          status: "processing",
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
          // 会话创建成功但获取快照失败，标记历史为失败
          set((state) => ({
            generationSession: null,
            generationHistory: state.generationHistory.map((h) =>
              h.id === sessionId ? { ...h, status: "failed" as const } : h
            ),
            error: { code: "SESSION_FETCH_FAILED", message: getErrorMessage(sessionError) },
          }));
        }
      }
    } catch (error) {
      set({ error: { code: "GENERATION_FAILED", message: getErrorMessage(error) } });
    }
  },

  confirmOutline: async (sessionId: string) => {
    try {
      await generateApi.confirmOutline(sessionId, { continue_from_retrieval: true });
      const sessionResponse = await generateApi.getSession(sessionId);
      set({ generationSession: sessionResponse?.data ?? null });
    } catch (error) {
      set({ error: { code: "CONFIRM_OUTLINE_FAILED", message: getErrorMessage(error) } });
    }
  },

  setLayoutMode: (mode: LayoutMode) => set({ layoutMode: mode }),
  setExpandedTool: (tool: ExpandedTool) => set({ expandedTool: tool }),
  clearLastFailedInput: () => set({ lastFailedInput: null }),
  reset: () => set(initialState),
}));
