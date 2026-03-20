"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, Settings, Share2, User } from "lucide-react";
import type { components } from "@/lib/sdk/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserInfo = components["schemas"]["UserInfo"];

interface HeaderActionsProps {
  user: UserInfo | null;
  onLogout: () => void;
  onOpenLibrary: () => void;
}

export function HeaderActions({
  user,
  onLogout,
  onOpenLibrary,
}: HeaderActionsProps) {
  return (
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
            onClick={onLogout}
            className="rounded-xl cursor-pointer text-[13px] font-medium text-red-600 focus:bg-red-50 focus:text-red-700 py-2.5 gap-2"
          >
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
