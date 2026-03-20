"use client";

import { motion } from "framer-motion";
import { Image as ImageIcon, Layers, Palette, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      className="mb-6 p-4 bg-zinc-50 rounded-2xl border border-zinc-200"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            内容详细程度
          </label>
          <ToggleGroup
            type="single"
            value={detailLevel}
            onValueChange={(value) => value && setDetailLevel(value as "brief" | "standard" | "detailed")}
            className="flex gap-1"
          >
            {DETAIL_LEVELS.map((level) => (
              <ToggleGroupItem key={level.value} value={level.value} className="flex-1 h-9 text-xs data-[state=on]:bg-zinc-900 data-[state=on]:text-zinc-50 border border-zinc-200 hover:bg-zinc-100">
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
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  visualTheme === theme.id
                    ? `bg-gradient-to-r ${theme.gradient} text-white border-transparent shadow-md`
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
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
            <SelectTrigger className="w-full h-9 bg-white border-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white shadow-lg">
              {IMAGE_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  <span className="mr-1.5">{style.icon}</span>
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-zinc-100 text-zinc-700"
            >
              {keyword}
              <button onClick={() => onRemoveKeyword(keyword)} className="hover:text-zinc-900">
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onAddKeyword()}
              placeholder="添加关键词..."
              className="h-7 w-24 text-xs bg-white border-zinc-200"
            />
            <Button variant="ghost" size="sm" onClick={onAddKeyword} className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-700">
              +
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
