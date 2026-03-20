"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Copy, GripVertical, Layers, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { slideCardVariants } from "../constants";
import type { SlideCard } from "../types";

interface OutlineSlidesEditorProps {
  slides: SlideCard[];
  activeSlideId: string;
  isGenerating: boolean;
  isOutlineHydrating: boolean;
  onSetActiveSlide: (id: string) => void;
  onUpdateSlide: (id: string, updates: Partial<SlideCard>) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (slide: SlideCard) => void;
  onAddSlide: () => void;
}

export function OutlineSlidesEditor({
  slides,
  activeSlideId,
  isGenerating,
  isOutlineHydrating,
  onSetActiveSlide,
  onUpdateSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onAddSlide,
}: OutlineSlidesEditorProps) {
  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {slides.map((slide, index) => (
          <motion.div
            key={slide.id}
            variants={slideCardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            className={cn(
              "bg-white border rounded-2xl p-5 shadow-sm transition-all duration-200 group",
              "hover:shadow-lg hover:-translate-y-0.5",
              activeSlideId === slide.id && "border-l-4 border-l-zinc-700 shadow-md",
              isGenerating && "opacity-60 pointer-events-none"
            )}
            onClick={() => !isGenerating && onSetActiveSlide(slide.id)}
          >
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <motion.span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-lg" whileHover={{ scale: 1.05 }}>
                  {String(index + 1).padStart(2, "0")}
                </motion.span>
                <button className="cursor-grab text-zinc-300 hover:text-zinc-500 transition-colors">
                  <GripVertical className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3 min-w-0">
                <Input
                  value={slide.title}
                  onChange={(event) => onUpdateSlide(slide.id, { title: event.target.value })}
                  placeholder="输入幻灯片标题..."
                  className="text-base font-medium border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
                  disabled={isGenerating || isOutlineHydrating}
                />

                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                    <Layers className="w-3 h-3" />
                    核心知识点
                  </label>
                  <Textarea
                    value={slide.keyPoints.join("\n")}
                    onChange={(event) =>
                      onUpdateSlide(slide.id, {
                        keyPoints: event.target.value.split("\n").filter(Boolean),
                      })
                    }
                    placeholder="每行一个知识点..."
                    className="min-h-[80px] text-sm bg-zinc-50/50 border-zinc-200 focus:border-zinc-400 focus:ring-zinc-200"
                    disabled={isGenerating || isOutlineHydrating}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    预计时长：{slide.estimatedMinutes} 分钟
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {slide.keyPoints.length} 个知识点
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onDuplicateSlide(slide)}>
                      <Copy className="w-4 h-4 mr-2" />
                      复制幻灯片
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSlide(slide.id);
                      }}
                      className="text-red-600 focus:text-red-600"
                      disabled={slides.length <= 1 || isGenerating || isOutlineHydrating}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onAddSlide}
        disabled={isGenerating || isOutlineHydrating}
        className="w-full p-4 rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
        添加新幻灯片
      </motion.button>
    </div>
  );
}
