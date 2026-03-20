"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionSwitcherItem } from "../types";

interface SessionSwitcherProps {
  sessions: SessionSwitcherItem[];
  activeSessionId: string | null;
  onChangeSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatingSession: boolean;
}

export function SessionSwitcher({
  sessions,
  activeSessionId,
  onChangeSession,
  onCreateSession,
  isCreatingSession,
}: SessionSwitcherProps) {
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const normalizedActiveSessionId =
    activeSessionId ?? (sessions.length > 0 ? sessions[0].sessionId : undefined);
  const activeSession = sessions.find(
    (session) => session.sessionId === normalizedActiveSessionId
  );

  return (
    <div className="justify-self-center w-full max-w-[720px] px-2 flex justify-center">
      {isSessionMenuOpen ? (
        <div
          className="fixed inset-0 z-[170] bg-black/10 backdrop-blur-[1px] transition-opacity duration-150"
          onClick={() => setIsSessionMenuOpen(false)}
        />
      ) : null}
      <DropdownMenu open={isSessionMenuOpen} onOpenChange={setIsSessionMenuOpen}>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="group flex items-center gap-2 rounded-xl px-4 py-2 transition-all duration-300 hover:bg-white/50 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <motion.span
              layoutId="session-title"
              className="max-w-[280px] truncate text-[20px] font-bold text-[var(--project-heading,#27272a)]"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {activeSession?.title ?? "选择会话"}
            </motion.span>
            {activeSession ? (
              <motion.div
                layoutId="session-indicator"
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            ) : null}
            <motion.div
              animate={{ rotate: isSessionMenuOpen ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="ml-0.5"
            >
              <ChevronDown className="h-4 w-4 text-[var(--project-text-muted)]" />
            </motion.div>
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="center"
            sideOffset={10}
            forceMount
            className="relative z-[180] w-[360px] overflow-visible border-0 bg-transparent p-0 shadow-none outline-none data-[state=closed]:animate-none data-[state=open]:animate-none"
          >
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative rounded-2xl border border-white/50 bg-white/70 p-2 shadow-xl shadow-zinc-200/30 backdrop-blur-2xl"
              >
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-zinc-500">
                    暂无历史会话
                  </div>
                ) : (
                  <>
                    {sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className={cn(
                          "group/session relative flex items-center gap-2 rounded-xl px-3 py-2 transition-colors",
                          session.sessionId === normalizedActiveSessionId
                            ? "border border-white/80 bg-white/60 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl"
                            : "hover:bg-white/40"
                        )}
                      >
                        {session.sessionId === normalizedActiveSessionId ? (
                          <div className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500" />
                        ) : null}
                        <button
                          onClick={() => onChangeSession(session.sessionId)}
                          className="flex flex-1 items-center justify-between gap-3 text-left"
                        >
                          <span
                            className={cn(
                              "truncate text-[13px] font-semibold",
                              session.sessionId === normalizedActiveSessionId
                                ? "text-zinc-800"
                                : "text-zinc-700"
                            )}
                          >
                            {session.title}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium tracking-wide text-zinc-400">
                            {session.updatedAt}
                          </span>
                        </button>
                      </div>
                    ))}
                    <DropdownMenuSeparator className="my-2 bg-zinc-200/60" />
                  </>
                )}
                <DropdownMenuItem
                  onClick={onCreateSession}
                  disabled={isCreatingSession}
                  className="cursor-pointer rounded-xl px-3 py-2 focus:bg-zinc-50"
                >
                  {isCreatingSession ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-zinc-400" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4 text-zinc-400" />
                  )}
                  <span className="text-[13px] font-medium text-zinc-700">
                    新建会话
                  </span>
                </DropdownMenuItem>
              </motion.div>
            </AnimatePresence>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenu>
    </div>
  );
}

