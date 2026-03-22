"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LightDeleteConfirm } from "@/components/project/features/shared/LightDeleteConfirm";
import type { SessionSwitcherItem } from "../types";

interface SessionSwitcherProps {
  sessions: SessionSwitcherItem[];
  activeSessionId: string | null;
  onChangeSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatingSession: boolean;
}

export function SessionSwitcher({
  sessions,
  activeSessionId,
  onChangeSession,
  onRenameSession,
  onDeleteSession,
  onCreateSession,
  isCreatingSession,
}: SessionSwitcherProps) {
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<SessionSwitcherItem | null>(null);
  const normalizedActiveSessionId =
    activeSessionId ??
    (sessions.length > 0 ? sessions[0].sessionId : undefined);
  const activeSession = sessions.find(
    (session) => session.sessionId === normalizedActiveSessionId
  );
  const handleContainerRef = (node: HTMLDivElement | null) => {
    if (!node) {
      setPortalContainer(null);
      return;
    }
    const themeRoot = node.closest("[data-project-theme]") as HTMLElement | null;
    setPortalContainer((prev) => (prev === themeRoot ? prev : themeRoot));
  };
  const handleStartInlineEdit = (session: SessionSwitcherItem) => {
    setEditingSessionId(session.sessionId);
    setRenameValue(session.title);
  };
  const handleCancelInlineEdit = () => {
    setEditingSessionId(null);
    setRenameValue("");
  };
  const handleSaveInlineEdit = (sessionId: string) => {
    onRenameSession(sessionId, renameValue);
    setEditingSessionId(null);
    setRenameValue("");
  };

  return (
    <div
      ref={handleContainerRef}
      className="project-session-wrap justify-self-center w-full max-w-[720px] px-2 flex justify-center"
    >
      {isSessionMenuOpen ? (
        <div
          className="project-session-overlay fixed inset-0 z-[170] bg-[var(--project-overlay)] backdrop-blur-[1px] transition-opacity duration-150"
          onClick={() => setIsSessionMenuOpen(false)}
        />
      ) : null}
      <DropdownMenu
        open={isSessionMenuOpen}
        onOpenChange={setIsSessionMenuOpen}
      >
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="project-session-trigger group flex items-center gap-2 rounded-[var(--project-control-radius)] px-4 py-2 transition-all duration-300 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          >
            <motion.span
              layoutId="session-title"
              className="project-session-title max-w-[280px] truncate text-[20px] font-bold text-[var(--project-heading,#27272a)]"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {activeSession?.title ?? "选择会话"}
            </motion.span>
            {activeSession ? (
              <motion.div
                layoutId="session-indicator"
                className="project-session-indicator w-1.5 h-1.5 rounded-full bg-[var(--project-success,#10b981)]"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            ) : null}
            <motion.div
              animate={{ rotate: isSessionMenuOpen ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="project-session-chevron ml-0.5"
            >
              <ChevronDown className="h-4 w-4 text-[var(--project-text-muted)]" />
            </motion.div>
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuPrimitive.Portal container={portalContainer ?? undefined}>
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
                className="project-session-menu project-session-menu-content relative rounded-[var(--project-menu-radius)] p-2"
              >
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-[var(--project-control-muted)]">
                    暂无历史会话
                  </div>
                ) : (
                  <>
                    {sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className={cn(
                          "project-session-item group/session relative flex items-center gap-2 rounded-[var(--project-chip-radius)] px-3 py-2 transition-colors",
                          session.sessionId === normalizedActiveSessionId
                            ? "project-session-item-active border"
                            : "project-session-item-hover"
                        )}
                      >
                        {session.sessionId === normalizedActiveSessionId ? (
                          <div className="project-session-item-marker absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--project-success,#10b981)]" />
                        ) : null}
                        {editingSessionId === session.sessionId ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1">
                            <Input
                              value={renameValue}
                              onChange={(event) =>
                                setRenameValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  handleSaveInlineEdit(session.sessionId);
                                }
                                if (event.key === "Escape") {
                                  handleCancelInlineEdit();
                                }
                              }}
                              placeholder="输入会话名称"
                              className="h-8 border-[var(--project-control-border)] bg-[var(--project-surface-elevated)] px-2 text-[13px] font-semibold text-[var(--project-text-primary)] focus-visible:ring-0"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveInlineEdit(session.sessionId)
                              }
                              className="rounded-[var(--project-chip-radius)] p-1.5 text-[var(--project-success,#10b981)] transition-colors hover:bg-[var(--project-success-soft,rgba(16,185,129,0.12))]"
                              aria-label="保存会话名称"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelInlineEdit}
                              className="rounded-[var(--project-chip-radius)] p-1.5 text-[var(--project-control-muted)] transition-colors hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-control-text)]"
                              aria-label="取消编辑会话名称"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => onChangeSession(session.sessionId)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1 text-left"
                          >
                            <span
                              className={cn(
                                "truncate text-[13px] font-semibold",
                                session.sessionId === normalizedActiveSessionId
                                  ? "text-[var(--project-control-text)]"
                                  : "text-[var(--project-text-primary)]"
                              )}
                            >
                              {session.title}
                            </span>
                            <span className="project-session-timestamp shrink-0 text-[10px] font-medium tracking-wide text-[var(--project-control-muted)]">
                              {session.updatedAt}
                            </span>
                          </button>
                        )}
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartInlineEdit(session)}
                            className="rounded-[var(--project-chip-radius)] p-1.5 text-[var(--project-control-muted)] transition-colors hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-control-text)]"
                            aria-label="编辑会话"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteSession(session);
                              setIsSessionMenuOpen(false);
                            }}
                            className="rounded-[var(--project-chip-radius)] p-1.5 text-[var(--project-control-muted)] transition-colors hover:bg-[var(--project-danger-soft,rgba(220,38,38,0.12))] hover:text-[var(--project-danger,#dc2626)]"
                            aria-label="删除会话"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <DropdownMenuSeparator className="my-2 bg-[var(--project-control-border)]" />
                  </>
                )}
                <DropdownMenuItem
                  onClick={onCreateSession}
                  disabled={isCreatingSession}
                  className="cursor-pointer rounded-[var(--project-chip-radius)] px-3 py-2 focus:bg-[var(--project-surface-muted)]"
                >
                  {isCreatingSession ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--project-control-muted)]" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4 text-[var(--project-control-muted)]" />
                  )}
                  <span className="text-[13px] font-medium text-[var(--project-text-primary)]">
                    新建会话
                  </span>
                </DropdownMenuItem>
              </motion.div>
            </AnimatePresence>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenu>

      <LightDeleteConfirm
        open={Boolean(pendingDeleteSession)}
        title="删除会话"
        description={
          pendingDeleteSession
            ? `将删除「${pendingDeleteSession.title}」，该操作在当前列表中不可恢复。`
            : ""
        }
        confirmText="删除"
        onCancel={() => setPendingDeleteSession(null)}
        onConfirm={() => {
          if (!pendingDeleteSession) return;
          onDeleteSession(pendingDeleteSession.sessionId);
          setPendingDeleteSession(null);
        }}
      />
    </div>
  );
}
