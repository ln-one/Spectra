import { create } from "zustand";

let notificationId = 0;
function genId(): string {
  notificationId = (notificationId + 1) % Number.MAX_SAFE_INTEGER;
  return `notification-${notificationId}`;
}

export type NotificationType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "upload"
  | "download"
  | "ai"
  | "project";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  icon?: string;
  duration?: number;
  progress?: number;
  status?: "uploading" | "parsing" | "success" | "failed";
  meta?: {
    fileName?: string;
    fileId?: string;
  };
  createdAt: number;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt">
  ) => string;
  updateNotification: (id: string, patch: Partial<Notification>) => void;
  replaceNotification: (
    id: string,
    notification: Omit<Notification, "id" | "createdAt">
  ) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const DEFAULT_DURATION = 5000;

const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string }> = {
  success: { icon: "✅", color: "#00C9A7" },
  error: { icon: "❌", color: "#FF3D71" },
  warning: { icon: "⚠️", color: "#FFB800" },
  info: { icon: "💬", color: "#1E86FF" },
  loading: { icon: "⏳", color: "#8B5CF6" },
  upload: { icon: "📤", color: "#06B6D4" },
  download: { icon: "📥", color: "#10B981" },
  ai: { icon: "🤖", color: "#EC4899" },
  project: { icon: "📁", color: "#F59E0B" },
};

const notificationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearNotificationTimer(id: string) {
  const timer = notificationTimeouts.get(id);
  if (timer) {
    clearTimeout(timer);
    notificationTimeouts.delete(id);
  }
}

function scheduleRemoval(
  id: string,
  duration: number | undefined,
  remove: (id: string) => void
) {
  clearNotificationTimer(id);
  if (duration && duration > 0) {
    const timer = setTimeout(() => {
      remove(id);
    }, duration);
    notificationTimeouts.set(id, timer);
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = genId();
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: Date.now(),
      duration: notification.duration ?? DEFAULT_DURATION,
      icon: notification.icon ?? TYPE_CONFIG[notification.type].icon,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
    }));

    scheduleRemoval(id, newNotification.duration, get().removeNotification);

    return id;
  },

  updateNotification: (id, patch) => {
    let nextDuration: number | undefined;
    let found = false;

    set((state) => {
      const notifications = state.notifications.map((n) => {
        if (n.id !== id) return n;
        found = true;
        const merged: Notification = {
          ...n,
          ...patch,
          id: n.id,
          createdAt: n.createdAt,
        };
        nextDuration = merged.duration;
        return merged;
      });
      return { notifications };
    });

    if (found) {
      scheduleRemoval(id, nextDuration, get().removeNotification);
    }
  },

  replaceNotification: (id, notification) => {
    let found = false;

    set((state) => {
      const notifications = state.notifications.map((n) => {
        if (n.id !== id) return n;
        found = true;
        return {
          ...notification,
          id: n.id,
          createdAt: n.createdAt,
          duration: notification.duration ?? DEFAULT_DURATION,
          icon: notification.icon ?? TYPE_CONFIG[notification.type].icon,
        } as Notification;
      });
      return { notifications };
    });

    if (found) {
      const current = get().notifications.find((n) => n.id === id);
      scheduleRemoval(id, current?.duration, get().removeNotification);
    }
  },

  removeNotification: (id) => {
    clearNotificationTimer(id);
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    Array.from(notificationTimeouts.keys()).forEach((id) =>
      clearNotificationTimer(id)
    );
    set({ notifications: [] });
  },
}));

export const getNotificationColor = (type: NotificationType): string => {
  return TYPE_CONFIG[type].color;
};
