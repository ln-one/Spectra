/**
 * Generate Store
 *
 * 使用 Zustand 管理生成任务/会话状态
 * 支持创建任务、会话、轮询状态、SSE 事件流、命令执行等功能
 *
 * 更新日期: 2026-03-04
 * 更新内容: 新增 Session 模型支持（会话驱动设计）
 */

import { create } from "zustand";
import {
  generateApi,
  type GenerateRequest,
  type GenerationState,
  type CreateGenerationSessionRequest,
  type GenerationSessionResponse,
  type GenerationCommandEnvelope,
  type SessionStatePayload,
} from "@/lib/api/generate";

// ============ Task 模型类型（兼容旧版） ============
export type TaskType = "ppt" | "word" | "both";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface GenerationTask {
  id: string;
  projectId: string;
  taskType: TaskType;
  status: TaskStatus;
  progress: number;
  inputData?: GenerateRequest["options"];
  outputUrls?: {
    ppt?: string;
    word?: string;
  };
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

// ============ Session 模型类型（会话驱动） ============

// 会话状态（9 态状态机）
export type SessionState = GenerationState;

// 命令类型
export type CommandType =
  | "UPDATE_OUTLINE"
  | "REDRAFT_OUTLINE"
  | "CONFIRM_OUTLINE"
  | "REGENERATE_SLIDE"
  | "RESUME_SESSION";

// 会话上下文
export interface GenerationSession {
  sessionId: string;
  projectId: string;
  taskId?: string; // 兼容旧任务模型
  state: SessionState;
  stateReason?: string;
  progress: number;
  contractVersion: string;
  schemaVersion?: number;
  resumable: boolean;
  updatedAt?: string;
  // 状态载荷
  options?: CreateGenerationSessionRequest["options"];
  outline?: unknown; // OutlineDocument
  capabilities?: unknown[]; // CapabilityDeclaration[]
  allowedActions?: string[];
  fallbacks?: unknown[]; // ExternalFallbackInfo[]
  result?: {
    ppt_url?: string;
    word_url?: string;
    version?: number;
  };
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    transition_guard?: string;
  };
}

// SSE 事件类型
export interface SessionEvent {
  event_id: string;
  event_type: string;
  state: SessionState;
  state_reason?: string;
  progress: number;
  timestamp: string;
  cursor: string;
  payload?: unknown;
}

// ============ Store 接口 ============

export interface GenerateState {
  // --- Legacy Task 状态（兼容） ---
  currentTask: GenerationTask | null;
  tasks: GenerationTask[];

  // --- Session 状态（会话驱动） ---
  currentSession: GenerationSession | null;
  sessions: GenerationSession[];
  isConnectingSSE: boolean;
  sseConnected: boolean;
  sseCursor: string | null;

  // --- 共享状态 ---
  isLoading: boolean;
  isPolling: boolean;
  pollingTaskId: string | null;
  error: string | null;

  // --- Legacy Task 方法（兼容） ---
  createTask: (
    projectId: string,
    taskType: TaskType,
    options?: GenerateRequest["options"]
  ) => Promise<GenerationTask>;
  fetchTaskStatus: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  pollTaskStatus: (taskId: string) => void;
  stopPolling: () => void;
  setCurrentTask: (task: GenerationTask | null) => void;
  clearTasks: () => void;

  // --- Session 方法（会话驱动） ---
  createSession: (
    projectId: string,
    outputType: "ppt" | "word" | "both",
    options?: CreateGenerationSessionRequest["options"]
  ) => Promise<GenerationSession>;
  getSession: (sessionId: string) => Promise<GenerationSession>;
  executeCommand: (
    sessionId: string,
    command: GenerationCommandEnvelope
  ) => Promise<void>;
  connectSessionEvents: (
    sessionId: string,
    onEvent: (event: SessionEvent) => void,
    onError?: (error: Event) => void
  ) => () => void;
  disconnectSessionEvents: () => void;
  setCurrentSession: (session: GenerationSession | null) => void;
  clearSessions: () => void;

  // --- 共享方法 ---
  clearError: () => void;
}

const pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
let sseEventSource: EventSource | null = null;

// 清理所有轮询定时器
const cleanupAllPolling = () => {
  pollingIntervals.forEach((interval) => {
    clearInterval(interval);
  });
  pollingIntervals.clear();
};

// 页面卸载时清理所有定时器和 SSE 连接，防止内存泄漏
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    cleanupAllPolling();
    if (sseEventSource) {
      sseEventSource.close();
      sseEventSource = null;
    }
  });
}

// 辅助函数：将 API 响应转换为 Session 对象
const mapResponseToSession = (
  response: GenerationSessionResponse
): GenerationSession => {
  const sessionRef = response.data.session;
  const payload = response.data;

  return {
    sessionId: sessionRef.session_id,
    projectId: sessionRef.project_id,
    taskId: sessionRef.task_id,
    state: sessionRef.state,
    stateReason: sessionRef.state_reason,
    progress: sessionRef.progress ?? 0,
    contractVersion: sessionRef.contract_version,
    resumable: sessionRef.resumable ?? false,
    updatedAt: sessionRef.updated_at,
    // 载荷字段（可选）
    options: payload.options,
    outline: payload.outline,
    capabilities: payload.capabilities,
    allowedActions: payload.allowed_actions,
    fallbacks: payload.fallbacks,
    result: payload.result,
    error: payload.error,
  };
};

export const useGenerateStore = create<GenerateState>()((set, get) => ({
  // --- Legacy Task 状态 ---
  currentTask: null,
  tasks: [],

  // --- Session 状态 ---
  currentSession: null,
  sessions: [],
  isConnectingSSE: false,
  sseConnected: false,
  sseCursor: null,

  // --- 共享状态 ---
  isLoading: false,
  isPolling: false,
  pollingTaskId: null,
  error: null,

  // ============ Legacy Task 方法（兼容） ============

  createTask: async (
    projectId: string,
    taskType: TaskType,
    options?: GenerateRequest["options"]
  ) => {
    set({ isLoading: true, error: null });

    try {
      const requestData: GenerateRequest = {
        project_id: projectId,
        type: taskType,
        start_mode: "direct_generate",
        options,
      };

      const response = await generateApi.generateCourseware(requestData);

      if (!response.success || !response.data.task_id) {
        throw new Error(response.message || "创建任务失败");
      }

      const newTask: GenerationTask = {
        id: response.data.task_id,
        projectId,
        taskType,
        status: response.data.status as TaskStatus,
        progress: 0,
        inputData: options,
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        currentTask: newTask,
        tasks: [newTask, ...state.tasks],
        isLoading: false,
      }));

      return newTask;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "创建任务失败";
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  fetchTaskStatus: async (taskId: string) => {
    try {
      const response = await generateApi.getGenerateStatus(taskId);

      if (!response.success) {
        throw new Error(response.message || "获取任务状态失败");
      }

      const taskData = response.data;

      set((state) => {
        const taskIndex = state.tasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1) return state;

        const updatedTask: GenerationTask = {
          ...state.tasks[taskIndex],
          status: taskData.status as TaskStatus,
          progress: taskData.progress || 0,
          outputUrls: taskData.result
            ? {
                ppt: taskData.result.ppt_url,
                word: taskData.result.word_url,
              }
            : undefined,
          errorMessage: taskData.error,
          completedAt:
            taskData.status === "completed" || taskData.status === "failed"
              ? new Date().toISOString()
              : undefined,
        };

        const updatedTasks = [...state.tasks];
        updatedTasks[taskIndex] = updatedTask;

        return {
          tasks: updatedTasks,
          currentTask:
            state.currentTask?.id === taskId ? updatedTask : state.currentTask,
        };
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "获取任务状态失败";
      set({ error: errorMessage });
    }
  },

  cancelTask: async (_taskId: string) => {
    get().stopPolling();
    set((state) => ({
      currentTask:
        state.currentTask?.id === _taskId
          ? { ...state.currentTask, status: "failed", errorMessage: "用户取消" }
          : state.currentTask,
    }));
  },

  pollTaskStatus: (taskId: string) => {
    const { isPolling, pollingTaskId, fetchTaskStatus } = get();

    if (isPolling && pollingTaskId === taskId) {
      return;
    }

    if (isPolling) {
      get().stopPolling();
    }

    set({ isPolling: true, pollingTaskId: taskId });

    const interval = setInterval(async () => {
      const task = get().tasks.find((t) => t.id === taskId);

      if (!task || task.status === "completed" || task.status === "failed") {
        get().stopPolling();
        return;
      }

      try {
        await fetchTaskStatus(taskId);
      } catch {
        get().stopPolling();
        return;
      }

      const updatedTask = get().tasks.find((t) => t.id === taskId);
      if (
        updatedTask &&
        (updatedTask.status === "completed" || updatedTask.status === "failed")
      ) {
        get().stopPolling();
      }
    }, 2000);

    pollingIntervals.set(taskId, interval);
  },

  stopPolling: () => {
    const { pollingTaskId } = get();

    if (pollingTaskId && pollingIntervals.has(pollingTaskId)) {
      const interval = pollingIntervals.get(pollingTaskId);
      if (interval) {
        clearInterval(interval);
      }
      pollingIntervals.delete(pollingTaskId);
    }

    set({ isPolling: false, pollingTaskId: null });
  },

  setCurrentTask: (task: GenerationTask | null) => {
    set({ currentTask: task });
  },

  clearTasks: () => {
    get().stopPolling();
    set({ currentTask: null, tasks: [] });
  },

  clearError: () => {
    set({ error: null });
  },

  // ============ Session 方法（会话驱动） ============

  createSession: async (
    projectId: string,
    outputType: "ppt" | "word" | "both",
    options?: CreateGenerationSessionRequest["options"]
  ) => {
    set({ isLoading: true, error: null });

    try {
      const requestData: CreateGenerationSessionRequest = {
        project_id: projectId,
        output_type: outputType,
        ...(options && { options }),
      };

      const response = await generateApi.createSession(requestData);

      if (!response.success || !response.data.session) {
        throw new Error(response.message || "创建会话失败");
      }

      const newSession: GenerationSession = {
        sessionId: response.data.session.session_id,
        projectId: response.data.session.project_id,
        taskId: response.data.session.task_id,
        state: response.data.session.state,
        progress: response.data.session.progress ?? 0,
        contractVersion: response.data.session.contract_version,
        resumable: response.data.session.resumable ?? false,
        // 注意：创建会话时只返回 session 引用，详细通过状态需 getSession 获取
      };

      set((state) => ({
        currentSession: newSession,
        sessions: [newSession, ...state.sessions],
        isLoading: false,
      }));

      return newSession;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "创建会话失败";
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  getSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await generateApi.getSession(sessionId);

      if (!response.success) {
        throw new Error(response.message || "获取会话失败");
      }

      const session = mapResponseToSession(response);

      set((state) => {
        const sessionIndex = state.sessions.findIndex(
          (s) => s.sessionId === sessionId
        );
        const updatedSessions = [...state.sessions];
        if (sessionIndex >= 0) {
          updatedSessions[sessionIndex] = session;
        } else {
          updatedSessions.push(session);
        }

        return {
          currentSession:
            state.currentSession?.sessionId === sessionId
              ? session
              : state.currentSession,
          sessions: updatedSessions,
          isLoading: false,
        };
      });

      return session;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "获取会话失败";
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  executeCommand: async (
    sessionId: string,
    command: GenerationCommandEnvelope
  ) => {
    set({ isLoading: true, error: null });

    try {
      const response = await generateApi.executeCommand(sessionId, command);

      if (!response.success) {
        throw new Error(response.message || "执行命令失败");
      }

      // 更新会话状态
      if (response.data.session) {
        const session = mapResponseToSession({
          success: true,
          data: response.data.session as unknown as SessionStatePayload,
          message: "ok",
        });

        set((state) => ({
          currentSession:
            state.currentSession?.sessionId === sessionId
              ? session
              : state.currentSession,
          sessions: state.sessions.map((s) =>
            s.sessionId === sessionId ? session : s
          ),
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "执行命令失败";
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  connectSessionEvents: (
    sessionId: string,
    onEvent: (event: SessionEvent) => void,
    onError?: (error: Event) => void
  ) => {
    // 先断开已有连接
    get().disconnectSessionEvents();

    set({ isConnectingSSE: true, sseCursor: null });

    const eventSource = generateApi.getSessionEvents(
      sessionId,
      get().sseCursor ?? undefined
    );
    sseEventSource = eventSource;

    eventSource.onopen = () => {
      set({ isConnectingSSE: false, sseConnected: true });
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SessionEvent;
        // 更新游标
        set({ sseCursor: data.cursor });

        // 更新会话状态
        if (data.state) {
          set((state) => {
            if (!state.currentSession) return state;
            return {
              currentSession: {
                ...state.currentSession,
                state: data.state,
                progress: data.progress ?? state.currentSession.progress,
                stateReason: data.state_reason,
              },
            };
          });
        }

        // 触发回调
        onEvent(data);
      } catch (parseError) {
        console.error("Failed to parse SSE event:", parseError);
      }
    };

    eventSource.onerror = (error) => {
      set({ sseConnected: false, isConnectingSSE: false });
      onError?.(error);
    };

    // 返回断开连接的函数
    return () => {
      get().disconnectSessionEvents();
    };
  },

  disconnectSessionEvents: () => {
    if (sseEventSource) {
      sseEventSource.close();
      sseEventSource = null;
    }
    set({ sseConnected: false, isConnectingSSE: false });
  },

  setCurrentSession: (session: GenerationSession | null) => {
    set({ currentSession: session });
  },

  clearSessions: () => {
    get().disconnectSessionEvents();
    set({ currentSession: null, sessions: [] });
  },
}));
