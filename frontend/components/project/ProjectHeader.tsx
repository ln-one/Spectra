"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface SessionSwitcherItem {
  sessionId: string;
  title: string;
  updatedAt: string;
}

interface ProjectHeaderProps {
  sessions: SessionSwitcherItem[];
  activeSessionId: string | null;
  onChangeSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatingSession: boolean;
  onOpenLibrary: () => void;
}

export function ProjectHeader({
  sessions,
  activeSessionId,
  onChangeSession,
  onCreateSession,
  isCreatingSession,
  onOpenLibrary,
}: ProjectHeaderProps) {
  const { user, logout } = useAuthStore();
  const { project, updateProjectName } = useProjectStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Session editing state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const sessionInputRef = useRef<HTMLInputElement>(null);
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (editingSessionId && sessionInputRef.current) {
      sessionInputRef.current.focus();
      sessionInputRef.current.select();
    }
  }, [editingSessionId]);

  const normalizedActiveSessionId =
    activeSessionId ??
    (sessions.length > 0 ? sessions[0].sessionId : undefined);

  const activeSession = sessions.find(
    (s) => s.sessionId === normalizedActiveSessionId
  );

  const handleStartEdit = () => {
    setEditValue(project?.name ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const nextName = editValue.trim();
    if (nextName && nextName !== project?.name) {
      void updateProjectName(nextName);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleEditInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") handleSaveEdit();
    if (event.key === "Escape") handleCancelEdit();
  };

  // Session management handlers
  const handleStartEditSession = (session: SessionSwitcherItem) => {
    setEditingSessionId(session.sessionId);
    setEditingSessionTitle(session.title);
  };

  const handleSaveSessionEdit = () => {
    // TODO: Implement session rename API call
    setEditingSessionId(null);
    setEditingSessionTitle("");
  };

  const handleCancelSessionEdit = () => {
    setEditingSessionId(null);
    setEditingSessionTitle("");
  };

  const handleDeleteSession = (_sessionId: string) => {
    // TODO: Implement session delete API call
  };

  const handleSessionInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") handleSaveSessionEdit();
    if (event.key === "Escape") handleCancelSessionEdit();
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6 z-50 relative"
    >
      <div className="flex min-w-0 items-center gap-4">
        <Link
          href="/projects"
          className="flex items-center gap-2 group relative"
        >
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center shadow-md shadow-zinc-900/20 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sparkles className="w-4 h-4 text-white" />
          </motion.div>
        </Link>

        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-sm border border-zinc-200"
          >
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={handleEditInputKeyDown}
              className="h-8 w-[220px] text-[15px] font-semibold border-0 focus-visible:ring-0 focus-visible:outline-none px-2"
              placeholder="输入项目名称"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={handleSaveEdit}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
              onClick={handleCancelEdit}
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : (
          <motion.button
            onClick={handleStartEdit}
            title="点击编辑项目名称"
            whileTap={{ scale: 0.98 }}
            className="group flex items-center gap-2 px-3 py-1.5 -ml-1.5 rounded-xl hover:bg-zinc-100/60 transition-all duration-300"
          >
            <h1 className="text-[30px] leading-[1.05] font-bold text-zinc-800 tracking-tight truncate max-w-[320px]">
              {project?.name ?? "加载�?.."}
            </h1>
            <div className="flex items-center justify-center px-1.5 py-0.5 rounded-md bg-zinc-100 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
              <span className="text-[18px] font-medium text-zinc-500">
                编辑
              </span>
            </div>
          </motion.button>
        )}
      </div>

      <div className="justify-self-center w-full max-w-[720px] px-2 flex justify-center">
        {isSessionMenuOpen && (
          <div
            className="fixed inset-0 z-[170] bg-black/10 backdrop-blur-[1px] transition-opacity duration-150"
            onClick={() => setIsSessionMenuOpen(false)}
          />
        )}
        <DropdownMenu
          open={isSessionMenuOpen}
          onOpenChange={setIsSessionMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/50 transition-all duration-300 group focus:outline-none focus-visible:outline-none focus-visible:ring-0"
            >
              <motion.span
                layoutId="session-title"
                className="text-[20px] font-bold text-zinc-800 truncate max-w-[280px]"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              >
                {activeSession?.title ?? "选择会话"}
              </motion.span>
              {activeSession && (
                <motion.div
                  layoutId="session-indicator"
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                  }}
                />
              )}
              <motion.div
                animate={{ rotate: isSessionMenuOpen ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="ml-0.5"
              >
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </motion.div>
            </motion.button>
          </DropdownMenuTrigger>
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              align="center"
              sideOffset={10}
              forceMount
              className="relative z-[180] w-[360px] border-0 bg-transparent p-0 shadow-none outline-none overflow-visible data-[state=open]:animate-none data-[state=closed]:animate-none"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  initial={{
                    opacity: 0,
                    y: -12,
                    scale: 0.96,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                  }}
                  exit={{
                    opacity: 0,
                    y: -8,
                    scale: 0.98,
                  }}
                  transition={{
                    duration: 0.2,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className="relative rounded-2xl border border-white/50 bg-white/70 backdrop-blur-2xl shadow-xl shadow-zinc-200/30 p-2"
                >
                  {sessions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-zinc-500 text-sm">
                      暂无历史会话
                    </div>
                  ) : (
                    <>
                      {sessions.map((session) => (
                        <div
                          key={session.sessionId}
                          className={cn(
                            "relative flex items-center gap-2 px-3 py-2 rounded-xl transition-colors group/session",
                            session.sessionId === normalizedActiveSessionId
                              ? "bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]"
                              : "hover:bg-white/40"
                          )}
                        >
                          {session.sessionId === normalizedActiveSessionId && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-500 rounded-r-full" />
                          )}
                          {editingSessionId === session.sessionId ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <Input
                                ref={sessionInputRef}
                                value={editingSessionTitle}
                                onChange={(e) =>
                                  setEditingSessionTitle(e.target.value)
                                }
                                onKeyDown={handleSessionInputKeyDown}
                                className="h-7 text-[13px] font-semibold border-0 focus-visible:ring-0 focus-visible:outline-none px-2 flex-1"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={handleSaveSessionEdit}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
                                onClick={handleCancelSessionEdit}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  onChangeSession(session.sessionId)
                                }
                                className="flex items-center justify-between gap-3 flex-1 text-left"
                              >
                                <span
                                  className={cn(
                                    "text-[13px] font-semibold truncate",
                                    session.sessionId ===
                                      normalizedActiveSessionId
                                      ? "text-zinc-800"
                                      : "text-zinc-700"
                                  )}
                                >
                                  {session.title}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium tracking-wide shrink-0">
                                  {session.updatedAt}
                                </span>
                              </button>
                              <div
                                className={cn(
                                  "flex items-center gap-0.5 transition-opacity",
                                  session.sessionId ===
                                    normalizedActiveSessionId
                                    ? "opacity-100"
                                    : "opacity-0 group-hover/session:opacity-100"
                                )}
                              >
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                                  onClick={() =>
                                    handleStartEditSession(session)
                                  }
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() =>
                                    handleDeleteSession(session.sessionId)
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <DropdownMenuSeparator className="my-2 bg-zinc-200/60" />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={onCreateSession}
                    disabled={isCreatingSession}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer focus:bg-zinc-50"
                  >
                    {isCreatingSession ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : (
                      <Plus className="w-4 h-4 text-zinc-400" />
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

      <div className="justify-self-end flex items-center gap-2">
        <motion.div
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          style={{ willChange: "transform" }}
        >
          <Button
            size="sm"
            className="rounded-full bg-white border border-zinc-200/80 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] hover:bg-zinc-50 hover:border-zinc-300 transition-all duration-300 text-zinc-700 font-semibold px-4 h-9 backdrop-blur-sm group"
            onClick={onOpenLibrary}
          >
            <Layers className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-amber-500 transition-colors duration-300" />
            Lib
          </Button>
        </motion.div>

        <div className="w-px h-4 bg-zinc-200/80 mx-1.5" />

        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-full transition-colors border border-transparent hover:border-zinc-200 hover:shadow-sm"
        >
          <Share2 className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-full transition-colors border border-transparent hover:border-zinc-200 hover:shadow-sm"
        >
          <Settings className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-9 h-9 ml-1 rounded-full bg-white border border-zinc-200 shadow-sm hover:shadow transition-all"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700 text-xs font-semibold">
                  {user?.username?.[0]?.toUpperCase() ?? (
                    <User className="w-4 h-4 text-zinc-500" />
                  )}
                </AvatarFallback>
              </Avatar>
            </motion.button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 rounded-2xl border-zinc-200/80 bg-white/95 backdrop-blur-xl shadow-xl p-2 mt-1 -mr-2"
          >
            <div className="px-3 py-2.5 bg-zinc-50/80 rounded-xl mb-1.5">
              <div className="text-sm font-semibold text-zinc-900 break-words">
                {user?.username ?? "用户"}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 break-words font-medium">
                {user?.email ?? ""}
              </div>
            </div>
            <DropdownMenuItem
              asChild
              className="rounded-xl cursor-pointer text-[13px] font-medium py-2.5 gap-2"
            >
              <Link href="/projects">项目列表</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-100 my-1" />
            <DropdownMenuItem
              onClick={logout}
              className="rounded-xl cursor-pointer text-[13px] font-medium text-red-600 focus:bg-red-50 focus:text-red-700 py-2.5 gap-2"
            >
              退出登录{" "}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
