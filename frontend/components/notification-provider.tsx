"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type MotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  getNotificationColor,
  type Notification,
} from "@/stores/notificationStore";

interface NotificationItemProps {
  notification: Notification;
  docked: boolean;
}

const DOCK_AFTER_MS = 2000;
const DOCK_OFFSET_PX = 340;

function isUploadInFlight(notification: Notification): boolean {
  return (
    notification.type === "upload" &&
    (notification.status === "uploading" || notification.status === "parsing")
  );
}

function getUploadStatusText(notification: Notification): string {
  if (notification.status === "success") return "上传成功";
  if (notification.status === "failed") return "上传失败";
  if (notification.status === "parsing") return "解析中";
  return "上传中";
}

function NotificationItem({ notification, docked }: NotificationItemProps) {
  const isUploadNotice = notification.type === "upload";
  const isInFlight = isUploadInFlight(notification);
  const effectiveType =
    isUploadNotice && notification.status === "success"
      ? "success"
      : isUploadNotice && notification.status === "failed"
        ? "error"
        : notification.type;
  const color = getNotificationColor(effectiveType);

  const animations: MotionProps = {
    initial: { opacity: 0, x: 18, y: -4 },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: 18, y: -4 },
    transition: { duration: 0.16, ease: "easeOut" },
  };

  return (
    <motion.div
      animate={{ x: docked ? DOCK_OFFSET_PX : 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full max-w-[400px] pointer-events-none"
    >
      <motion.figure
        {...animations}
        className={cn(
          "relative mx-auto min-h-fit w-full overflow-hidden rounded-2xl p-4",
          "bg-white [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]",
          "transform-gpu"
        )}
      >
        <div className="flex flex-row items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: color }}
          >
            {isInFlight ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <span className="text-lg leading-none text-white">
                {notification.icon}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <p className="text-sm font-medium text-zinc-900">
              {notification.title}
            </p>

            {isUploadNotice ? (
              <p className="mt-1 inline-flex w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {getUploadStatusText(notification)}
              </p>
            ) : (
              notification.description && (
                <p className="text-sm font-normal text-zinc-600">
                  {notification.description}
                </p>
              )
            )}
          </div>
        </div>
      </motion.figure>
    </motion.div>
  );
}

export function NotificationProvider() {
  const { notifications } = useNotificationStore();
  const [isEdgeHovering, setIsEdgeHovering] = useState(false);
  const [dockedIds, setDockedIds] = useState<Record<string, boolean>>({});
  const dockTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  useEffect(() => {
    const currentIds = new Set(notifications.map((n) => n.id));

    setDockedIds((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([id, docked]) => {
        const notification = notifications.find((n) => n.id === id);
        if (notification && isUploadInFlight(notification) && docked) {
          next[id] = true;
        }
      });
      return next;
    });

    Object.entries(dockTimersRef.current).forEach(([id, timer]) => {
      const notification = notifications.find((n) => n.id === id);
      if (!notification || !isUploadInFlight(notification)) {
        clearTimeout(timer);
        delete dockTimersRef.current[id];
      }
    });

    notifications.forEach((notification) => {
      if (!isUploadInFlight(notification)) return;
      if (dockedIds[notification.id]) return;
      if (dockTimersRef.current[notification.id]) return;

      dockTimersRef.current[notification.id] = setTimeout(() => {
        setDockedIds((prev) => ({ ...prev, [notification.id]: true }));
        delete dockTimersRef.current[notification.id];
      }, DOCK_AFTER_MS);
    });

    return () => {
      Object.entries(dockTimersRef.current).forEach(([id, timer]) => {
        if (!currentIds.has(id)) {
          clearTimeout(timer);
          delete dockTimersRef.current[id];
        }
      });
    };
  }, [notifications]);

  const shouldDockMap = useMemo(() => {
    const map = new Map<string, boolean>();
    notifications.forEach((notification) => {
      map.set(
        notification.id,
        Boolean(dockedIds[notification.id]) &&
          isUploadInFlight(notification) &&
          !isEdgeHovering
      );
    });
    return map;
  }, [dockedIds, isEdgeHovering, notifications]);

  return (
    <>
      <div
        className="fixed inset-y-0 right-0 z-50 w-6 pointer-events-auto"
        onMouseEnter={() => setIsEdgeHovering(true)}
        onMouseLeave={() => setIsEdgeHovering(false)}
      />
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
        <AnimatePresence mode="sync">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              docked={shouldDockMap.get(notification.id) ?? false}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
