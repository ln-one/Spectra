"use client";

import { motion, AnimatePresence, type MotionProps } from "motion/react";

import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  getNotificationColor,
  type Notification,
} from "@/stores/notificationStore";

interface NotificationItemProps {
  notification: Notification;
}

function NotificationItem({ notification }: NotificationItemProps) {
  const color = getNotificationColor(notification.type);

  const animations: MotionProps = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, originY: 0 },
    exit: { scale: 0, opacity: 0 },
    transition: { type: "spring", stiffness: 350, damping: 40 },
  };

  return (
    <motion.figure
      {...animations}
      layout
      className={cn(
        "relative mx-auto min-h-fit w-full max-w-[400px] overflow-hidden rounded-2xl p-4",
        "transition-all duration-200 ease-in-out hover:scale-[103%]",
        "bg-white [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]",
        "transform-gpu dark:bg-transparent dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset] dark:backdrop-blur-md dark:[border:1px_solid_rgba(255,255,255,.1)]"
      )}
    >
      <div className="flex flex-row items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: color }}
        >
          <span className="text-lg drop-shadow-none">{notification.icon}</span>
        </div>
        <div className="flex flex-col overflow-hidden">
          <p className="text-sm font-medium dark:text-white">
            {notification.title}
          </p>
          {notification.description && (
            <p className="text-sm font-normal dark:text-white/60">
              {notification.description}
            </p>
          )}
        </div>
      </div>
    </motion.figure>
  );
}

export function NotificationProvider() {
  const { notifications } = useNotificationStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-center gap-4 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto w-full">
            <NotificationItem notification={notification} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
