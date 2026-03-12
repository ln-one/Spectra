"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Share2, Settings, Sparkles, User, Check, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectHeader() {
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

  const handleStartEdit = () => {
    setEditValue(project?.name ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== project?.name) {
      updateProjectName(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-16 flex items-center justify-between px-6 bg-white border-b border-gray-100 shrink-0"
    >
      <div className="flex items-center gap-4">
        <Link href="/projects" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-zinc-900">Spectra</span>
        </Link>
        <div className="h-6 w-px bg-gray-200" />

        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 w-[200px] text-base font-medium bg-white border-zinc-300 focus:border-zinc-500 focus:ring-zinc-200"
              placeholder="输入项目名称"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSaveEdit}
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCancelEdit}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : (
          <button
            onClick={handleStartEdit}
            className="group flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-zinc-100 transition-colors"
            title="点击编辑项目名称"
          >
            <h1 className="text-lg font-semibold text-zinc-800 truncate max-w-[200px]">
              {project?.name ?? "加载中..."}
            </h1>
            <span className="text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
              编辑
            </span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-full px-4"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          创建笔记本
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
                  {user?.username?.[0]?.toUpperCase() ?? (
                    <User className="w-4 h-4" />
                  )}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-sm font-medium text-zinc-900">
              {user?.username ?? "用户"}
            </div>
            <div className="px-2 py-1 text-xs text-zinc-500">
              {user?.email ?? ""}
            </div>
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
