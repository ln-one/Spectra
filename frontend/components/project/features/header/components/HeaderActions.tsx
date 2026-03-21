"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, Palette, Settings, Share2, User } from "lucide-react";
import type { components } from "@/lib/sdk/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getThemePresetDefinition,
  THEME_PRESETS,
  type ThemePresetId,
} from "../theme";

type UserInfo = components["schemas"]["UserInfo"];

interface HeaderActionsProps {
  user: UserInfo | null;
  onLogout: () => void;
  onOpenLibrary: () => void;
  selectedThemePreset: ThemePresetId;
  onThemePresetChange: (themeId: ThemePresetId) => void;
}

const STYLE_LABELS = {
  "mist-zinc": "Classic",
  "ocean-cyan": "Ocean",
  "teal-mint": "Mint",
  "ink-sky": "Ink",
  "forest-emerald": "Editorial",
  "sand-ochre": "Sand",
  "sunset-amber": "Sunset",
  "graphite-blue": "Bold",
  "lavender-slate": "Lavender",
  "rose-wine": "Rose",
} as const;

export function HeaderActions({
  user,
  onLogout,
  onOpenLibrary,
  selectedThemePreset,
  onThemePresetChange,
}: HeaderActionsProps) {
  const activeThemeDefinition = getThemePresetDefinition(selectedThemePreset);

  return (
    <div className="project-header-actions justify-self-end flex items-center gap-2">
      <motion.div
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        style={{ willChange: "transform" }}
      >
        <Button
          size="sm"
          className="project-header-control project-header-library-btn rounded-full border transition-all duration-300 font-semibold px-4 h-[var(--project-control-height)] backdrop-blur-sm group"
          onClick={onOpenLibrary}
        >
          <Layers className="w-4 h-4 mr-2 text-[var(--project-control-muted)] group-hover:text-[var(--project-accent)] transition-colors duration-300" />
          Lib
        </Button>
      </motion.div>

      <div className="project-header-divider w-px h-4 bg-[var(--project-control-border)] mx-1.5" />

      <Button
        variant="ghost"
        size="icon"
        className="project-header-control project-header-action-btn w-9 h-[var(--project-control-height)] rounded-full transition-colors border border-transparent hover:shadow-sm"
      >
        <Share2 className="w-4 h-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="project-header-control project-header-action-btn w-9 h-[var(--project-control-height)] rounded-full transition-colors border border-transparent hover:shadow-sm"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="project-header-menu w-64 overflow-visible backdrop-blur-xl p-2 mt-1"
        >
          <DropdownMenuLabel className="text-[13px] text-[var(--project-control-muted)] font-medium">
            页面设置
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[var(--project-control-border)] my-1" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-xl cursor-pointer text-[13px] font-medium py-2.5 gap-2">
              <Palette className="w-4 h-4 text-[var(--project-control-muted)]" />
              主题配色
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="project-header-menu w-80 max-h-[360px] overflow-y-auto backdrop-blur-xl p-2">
              <DropdownMenuRadioGroup
                value={selectedThemePreset}
                onValueChange={(value) =>
                  onThemePresetChange(value as ThemePresetId)
                }
              >
                {THEME_PRESETS.map((theme) => (
                  <DropdownMenuRadioItem key={theme.id} value={theme.id} className="rounded-xl cursor-pointer py-2.5">
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--project-control-text)]">
                          {theme.name}
                        </div>
                        <div className="text-[11px] text-[var(--project-control-muted)] mt-0.5 truncate">
                          {theme.description}
                        </div>
                        <div className="mt-1 inline-flex items-center rounded-full border border-[var(--project-control-border)] bg-[var(--project-surface-muted)] px-2 py-0.5 text-[10px] text-[var(--project-control-muted)]">
                          {
                            STYLE_LABELS[
                              getThemePresetDefinition(theme.id).styleVariant
                            ]
                          }
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {theme.swatches.map((color) => (
                          <span
                            key={color}
                            className="h-3 w-3 rounded-full border border-[var(--project-control-border)]"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            disabled
            className="rounded-xl text-[12px] text-[var(--project-control-muted)] py-2.5"
          >
            当前风格：{STYLE_LABELS[activeThemeDefinition.styleVariant]}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="project-header-control project-header-avatar-btn flex items-center justify-center w-9 h-[var(--project-control-height)] ml-1 rounded-full border shadow-sm hover:shadow transition-all"
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-[var(--project-surface-muted)] text-[var(--project-control-text)] text-xs font-semibold">
                {user?.username?.[0]?.toUpperCase() ?? (
                  <User className="w-4 h-4 text-[var(--project-control-muted)]" />
                )}
              </AvatarFallback>
            </Avatar>
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="project-header-menu w-56 backdrop-blur-xl p-2 mt-1 -mr-2"
        >
          <div className="px-3 py-2.5 bg-[var(--project-surface-muted)] rounded-xl mb-1.5">
            <div className="text-sm font-semibold text-[var(--project-control-text)] break-words">
              {user?.username ?? "用户"}
            </div>
            <div className="text-xs text-[var(--project-control-muted)] mt-0.5 break-words font-medium">
              {user?.email ?? ""}
            </div>
          </div>
          <DropdownMenuItem
            asChild
            className="rounded-xl cursor-pointer text-[13px] font-medium py-2.5 gap-2"
          >
            <Link href="/projects">项目列表</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-[var(--project-control-border)] my-1" />
          <DropdownMenuItem
            onClick={onLogout}
            className="rounded-xl cursor-pointer text-[13px] font-medium text-[var(--project-danger)] focus:bg-[var(--project-danger-soft)] focus:text-[var(--project-danger)] py-2.5 gap-2"
          >
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
