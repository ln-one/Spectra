"use client";

import { motion } from "framer-motion";
import { Image as ImageIcon, Layers, Palette, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { DETAIL_LEVELS, IMAGE_STYLES, VISUAL_THEMES } from "../constants";

interface OutlineInlineSettingsProps {
  detailLevel: "brief" | "standard" | "detailed";
  setDetailLevel: (value: "brief" | "standard" | "detailed") => void;
  visualTheme: string;
  setVisualTheme: (value: string) => void;
  imageStyle: string;
  setImageStyle: (value: string) => void;
  keywords: string[];
  keywordInput: string;
  setKeywordInput: (value: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (value: string) => void;
}

export function OutlineInlineSettings({
  detailLevel,
  setDetailLevel,
  visualTheme,
  setVisualTheme,
  imageStyle,
  setImageStyle,
  keywords,
  keywordInput,
  setKeywordInput,
  onAddKeyword,
  onRemoveKeyword,
}: OutlineInlineSettingsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            内容详细度
          </label>
          <ToggleGroup
            type="single"
            value={detailLevel}
            onValueChange={(value) =>
              value &&
              setDetailLevel(value as "brief" | "standard" | "detailed")
            }
            className="flex gap-1"
          >
            {DETAIL_LEVELS.map((level) => (
              <ToggleGroupItem
                key={level.value}
                value={level.value}
                className="flex-1 h-9 text-xs border border-zinc-200 text-zinc-600 data-[state=on]:border-blue-500 data-[state=on]:bg-blue-50 data-[state=on]:text-blue-700"
              >
                {level.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            视觉主题
          </label>
          <div className="flex flex-wrap gap-1.5">
            {VISUAL_THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => setVisualTheme(theme.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                  visualTheme === theme.id
                    ? `bg-gradient-to-r ${theme.gradient} border-transparent text-white`
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                )}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" />
            配图风格
          </label>
          <Select value={imageStyle} onValueChange={setImageStyle}>
            <SelectTrigger className="w-full h-9 border-zinc-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white shadow-lg">
              {IMAGE_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  <span className="mr-1.5 text-[11px] text-zinc-400">{style.icon}</span>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" />
          关键词标签
        </label>
        <div className="flex flex-wrap gap-1.5 items-center">
          {keywords.map((keyword) => (
            <motion.span
              key={keyword}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
            >
              {keyword}
              <button
                onClick={() => onRemoveKeyword(keyword)}
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onAddKeyword()}
              placeholder="添加关键词..."
              className="h-8 w-32 text-xs border-zinc-200 bg-white"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onAddKeyword}
              className="h-8 px-3 text-xs border-zinc-200"
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
