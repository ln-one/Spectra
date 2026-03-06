import {
  useNotificationStore,
  type NotificationType,
} from "@/stores/notificationStore";

interface NotificationOptions {
  title: string;
  description?: string;
  type?: NotificationType;
  icon?: string;
  duration?: number;
}

export function useNotification() {
  const { addNotification, removeNotification, clearNotifications } =
    useNotificationStore();

  const notify = (options: NotificationOptions) => {
    return addNotification({
      title: options.title,
      description: options.description,
      type: options.type ?? "info",
      icon: options.icon,
      duration: options.duration,
    });
  };

  const success = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "success", duration });
  };

  const error = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "error", duration });
  };

  const warning = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "warning", duration });
  };

  const info = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "info", duration });
  };

  const loading = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "loading", duration });
  };

  const upload = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "upload", duration });
  };

  const download = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "download", duration });
  };

  const ai = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "ai", duration });
  };

  const project = (title: string, description?: string, duration?: number) => {
    return addNotification({ title, description, type: "project", duration });
  };

  return {
    notify,
    success,
    error,
    warning,
    info,
    loading,
    upload,
    download,
    ai,
    project,
    remove: removeNotification,
    clear: clearNotifications,
  };
}
