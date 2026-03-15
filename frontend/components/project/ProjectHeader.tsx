"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Loader2,
  PanelRightOpen,
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
    activeSessionId ?? (sessions.length > 0 ? sessions[0].sessionId : undefined);

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

  const handleEditInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleSaveEdit();
    if (event.key === "Escape") handleCancelEdit();
  };

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className="h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6 bg-white/85 backdrop-blur border-b border-zinc-200/70"
    >
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/projects" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-zinc-900">Spectra</span>
        </Link>
        <div className="h-6 w-px bg-zinc-200" />

        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5"
          >
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={handleEditInputKeyDown}
              className="h-8 w-[220px] text-base font-medium"
              placeholder="输入项目名称"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={handleSaveEdit}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              onClick={handleCancelEdit}
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : (
          <button
            onClick={handleStartEdit}
            title="点击编辑项目名称"
            className="group flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <h1 className="text-lg font-semibold text-zinc-800 truncate max-w-[260px]">
              {project?.name ?? "加载中..."}
            </h1>
            <span className="text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
              编辑
            </span>
          </button>
        )}
      </div>

      <div className="justify-self-center w-full max-w-[620px] px-2">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <Select
            value={normalizedActiveSessionId}
            onValueChange={onChangeSession}
            disabled={sessions.length === 0}
          >
            <SelectTrigger className="h-9 flex-1 border-0 bg-transparent shadow-none px-3 focus:ring-0">
              <SelectValue placeholder="选择会话分支" />
              <ChevronDown className="h-4 w-4 opacity-60" />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <SelectItem value="empty" disabled>
                  暂无会话
                </SelectItem>
              ) : (
                sessions.map((session) => (
                  <SelectItem key={session.sessionId} value={session.sessionId}>
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="truncate max-w-[220px]">{session.title}</span>
                      <span className="text-xs text-zinc-500">{session.updatedAt}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="secondary"
            className="rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100"
            onClick={onCreateSession}
            disabled={isCreatingSession}
          >
            {isCreatingSession ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            新会话
          </Button>
        </div>
      </div>

      <div className="justify-self-end flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full bg-white"
          onClick={onOpenLibrary}
        >
          <PanelRightOpen className="w-4 h-4 mr-1.5" />
          Lib
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full"
        >
          <Share2 className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full"
        >
          <Settings className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xs font-medium">
                  {user?.username?.[0]?.toUpperCase() ?? <User className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-sm font-medium text-zinc-900">
              {user?.username ?? "用户"}
            </div>
            <div className="px-2 py-1 text-xs text-zinc-500">{user?.email ?? ""}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/projects">项目列表</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-red-600">
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
