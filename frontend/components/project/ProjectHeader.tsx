"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Loader2,
  Library,
  Plus,
  Settings,
  Share2,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const normalizedActiveSessionId =
    activeSessionId ??
    (sessions.length > 0 ? sessions[0].sessionId : undefined);

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

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6 bg-white/80 backdrop-blur-xl border-b border-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.02)] z-50 relative"
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
        <div className="h-5 w-px bg-zinc-200/80" />

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
              className="h-8 w-[220px] text-[15px] font-semibold border-0 focus-visible:ring-0 px-2"
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
            whileHover={{ scale: 1.01 }}
            className="group flex items-center gap-2 px-3 py-1.5 -ml-1.5 rounded-xl bg-zinc-100/50 hover:bg-white hover:shadow-sm border border-transparent hover:border-zinc-200/60 transition-all duration-300"
          >
            <h1 className="text-[15px] font-semibold text-zinc-800 tracking-tight truncate max-w-[260px]">
              {project?.name ?? "加载中..."}
            </h1>
            <div className="flex items-center justify-center px-1.5 py-0.5 rounded-md bg-zinc-100 border border-zinc-200/60 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
              <span className="text-[10px] font-medium text-zinc-500">
                编辑
              </span>
            </div>
          </motion.button>
        )}
      </div>

      <div className="justify-self-center w-full max-w-[620px] px-2 flex justify-center">
        <motion.div
          className="flex items-center gap-1 rounded-full bg-zinc-50/50 hover:bg-white border border-transparent hover:border-zinc-200/60 hover:shadow-sm px-1.5 py-1.5 transition-all duration-300 group"
          layout
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-2 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <Select
            value={normalizedActiveSessionId}
            onValueChange={onChangeSession}
            disabled={sessions.length === 0}
          >
            <SelectTrigger className="h-8 w-auto min-w-[120px] max-w-[240px] border-0 bg-transparent shadow-none px-2 text-[14px] font-medium focus:ring-0 text-zinc-700 group-hover:text-zinc-900 transition-colors">
              <SelectValue placeholder="选择会话分支" />
              <ChevronDown className="h-3.5 w-3.5 ml-1.5 text-zinc-400" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-zinc-200/80 bg-white/95 backdrop-blur-xl shadow-xl shadow-zinc-200/30 p-1.5 min-w-[240px]">
              {sessions.length === 0 ? (
                <SelectItem
                  value="empty"
                  disabled
                  className="text-zinc-500 text-sm py-2"
                >
                  暂无历史会话
                </SelectItem>
              ) : (
                sessions.map((session) => (
                  <SelectItem
                    key={session.sessionId}
                    value={session.sessionId}
                    className="rounded-xl my-0.5 cursor-pointer focus:bg-zinc-50 py-2 transition-colors data-[state=checked]:bg-zinc-100"
                  >
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="font-medium text-[13px] text-zinc-800 truncate">
                        {session.title}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium tracking-wide">
                        {session.updatedAt}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <div className="w-px h-3.5 bg-zinc-200 mx-0.5" />

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors ml-0.5"
              onClick={onCreateSession}
              disabled={isCreatingSession}
              title="新建会话"
            >
              {isCreatingSession ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
          </motion.div>
        </motion.div>
      </div>

      <div className="justify-self-end flex items-center gap-2">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            size="sm"
            className="rounded-full bg-white border border-zinc-200/80 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] hover:bg-zinc-50 hover:border-zinc-300 transition-all duration-300 text-zinc-700 font-medium px-4 h-9 backdrop-blur-sm group"
            onClick={onOpenLibrary}
          >
            <Library className="w-4 h-4 mr-2 text-zinc-400 group-hover:text-amber-500 transition-colors duration-300" />
            Library
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
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
