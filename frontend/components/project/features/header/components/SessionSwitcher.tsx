"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { LightDeleteConfirm } from "@/components/project/features/shared/LightDeleteConfirm";
import type { SessionSwitcherItem } from "../types";

interface SessionSwitcherProps {
  sessions: SessionSwitcherItem[];
  activeSessionId: string | null;
  onChangeSession: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onDeleteSession?: (sessionId: string) => void;
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

  const safeRenameSession = onRenameSession ?? (() => {});
  const safeDeleteSession = onDeleteSession ?? (() => {});

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
    const themeRoot = node.closest(
      "[data-project-theme]"
    ) as HTMLElement | null;
    const nextContainer = themeRoot ?? node.ownerDocument.body;
    setPortalContainer((prev) => (prev === nextContainer ? prev : nextContainer));
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
    safeRenameSession(sessionId, renameValue);
    setEditingSessionId(null);
    setRenameValue("");
  };

  useEffect(() => {
    if (!isSessionMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSessionMenuOpen(false);
        setEditingSessionId(null);
        setRenameValue("");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isSessionMenuOpen]);

  const menuLayer =
    isSessionMenuOpen && portalContainer
      ? createPortal(
          <>
            <div
              className="project-session-overlay absolute inset-0 z-[170] bg-[var(--project-overlay)] backdrop-blur-[1px] transition-opacity duration-150"
              onClick={() => {
                setIsSessionMenuOpen(false);
                handleCancelInlineEdit();
              }}
            />
            <div
              className="absolute inset-0 z-[180] flex items-start justify-center px-4 pointer-events-none"
              style={{
                paddingTop: "calc(var(--project-header-height) + 12px)",
              }}
            >
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.985 }}
                  transition={{
                    duration: 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="project-session-menu project-session-menu-content relative pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-[var(--project-menu-radius)] p-2"
                  role="dialog"
                  aria-modal="true"
                  aria-label="会话管理器"
                  onClick={(event) => event.stopPropagation()}
                >
                  {sessions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-[var(--project-control-muted)]">
                      暂无历史会话
                    </div>
                  ) : (
                    <div className="max-h-[320px] overflow-y-auto pr-1">
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
                              type="button"
                              onClick={() => {
                                onChangeSession(session.sessionId);
                                setIsSessionMenuOpen(false);
                              }}
                              className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1 text-left"
                            >
                              <div className="min-w-0">
                                <span
                                  className={cn(
                                    "block truncate text-[13px] font-semibold",
                                    session.sessionId ===
                                      normalizedActiveSessionId
                                      ? "text-[var(--project-control-text)]"
                                      : "text-[var(--project-text-primary)]"
                                  )}
                                >
                                  {session.title}
                                </span>
                                {session.runSummary ? (
                                  <span className="block truncate text-[10px] text-[var(--project-control-muted)]">
                                    {session.runSummary}
                                  </span>
                                ) : null}
                              </div>
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
                              aria-label="隐藏会话"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="my-2 h-px bg-[var(--project-control-border)]" />
                  <div className="sticky bottom-0 rounded-[var(--project-chip-radius)] bg-[var(--project-surface)]/95 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => {
                        onCreateSession();
                        setIsSessionMenuOpen(false);
                      }}
                      disabled={isCreatingSession}
                      className="flex w-full items-center rounded-[var(--project-chip-radius)] px-3 py-2 text-left transition-colors hover:bg-[var(--project-surface-muted)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreatingSession ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--project-control-muted)]" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4 text-[var(--project-control-muted)]" />
                      )}
                      <span className="text-[13px] font-medium text-[var(--project-text-primary)]">
                        新建会话
                      </span>
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </>,
          portalContainer
        )
      : null;

  return (
    <div
      ref={handleContainerRef}
      className="project-session-wrap justify-self-center w-full max-w-[720px] px-2 flex justify-center"
    >
      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="project-session-trigger group flex items-center gap-2 rounded-[var(--project-control-radius)] px-4 py-2 transition-all duration-300 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        data-tour="session-switcher"
        aria-haspopup="dialog"
        aria-expanded={isSessionMenuOpen}
        onClick={() => setIsSessionMenuOpen((prev) => !prev)}
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
      {menuLayer}

      <LightDeleteConfirm
        open={Boolean(pendingDeleteSession)}
        title="隐藏会话"
        description={
          pendingDeleteSession
            ? `将隐藏“${pendingDeleteSession.title}”，清理本地数据后可重新显示。`
            : ""
        }
        confirmText="隐藏"
        onCancel={() => setPendingDeleteSession(null)}
        onConfirm={() => {
          if (!pendingDeleteSession) return;
          safeDeleteSession(pendingDeleteSession.sessionId);
          setPendingDeleteSession(null);
        }}
      />
    </div>
  );
}
