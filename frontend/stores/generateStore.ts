/**
 * Generate Store
 *
 * 使用 Zustand 管理生成任务状态
 * 支持创建任务、轮询状态、下载结果等功能
 */

import { create } from "zustand";
import { generateApi, type GenerateRequest } from "@/lib/api/generate";

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

export interface GenerateState {
  currentTask: GenerationTask | null;
  tasks: GenerationTask[];
  isLoading: boolean;
  isPolling: boolean;
  pollingTaskId: string | null;
  error: string | null;

  createTask: (projectId: string, taskType: TaskType, options?: GenerateRequest["options"]) => Promise<GenerationTask>;
  fetchTaskStatus: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  pollTaskStatus: (taskId: string) => void;
  stopPolling: () => void;
  setCurrentTask: (task: GenerationTask | null) => void;
  clearTasks: () => void;
  clearError: () => void;
}

const pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

export const useGenerateStore = create<GenerateState>()((set, get) => ({
  currentTask: null,
  tasks: [],
  isLoading: false,
  isPolling: false,
  pollingTaskId: null,
  error: null,

  createTask: async (projectId: string, taskType: TaskType, options?: GenerateRequest["options"]) => {
    set({ isLoading: true, error: null });

    try {
      const requestData: GenerateRequest = {
        project_id: projectId,
        type: taskType,
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
      const errorMessage = error instanceof Error ? error.message : "创建任务失败";
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
          completedAt: taskData.status === "completed" || taskData.status === "failed"
            ? new Date().toISOString()
            : undefined,
        };

        const updatedTasks = [...state.tasks];
        updatedTasks[taskIndex] = updatedTask;

        return {
          tasks: updatedTasks,
          currentTask: state.currentTask?.id === taskId ? updatedTask : state.currentTask,
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "获取任务状态失败";
      set({ error: errorMessage });
    }
  },

  cancelTask: async (_taskId: string) => {
    get().stopPolling();
    set((state) => ({
      currentTask: state.currentTask?.id === _taskId
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
      if (updatedTask && (updatedTask.status === "completed" || updatedTask.status === "failed")) {
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
}));
