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
  createdAt: number;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt">
  ) => string;
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
      notifications: [newNotification, ...state.notifications].slice(0, 5),
    }));

    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
}));

export const getNotificationColor = (type: NotificationType): string => {
  return TYPE_CONFIG[type].color;
};
