"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  Copy,
  GripVertical,
  Layers,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
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
              "group rounded-2xl border border-zinc-200 bg-[linear-gradient(155deg,#ffffff,#f8fafc)] p-5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.5)]",
              activeSlideId === slide.id &&
                "border-blue-300 bg-[linear-gradient(155deg,#ffffff,#eff6ff)]",
              isGenerating && "pointer-events-none opacity-65"
            )}
            onClick={() => !isGenerating && onSetActiveSlide(slide.id)}
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-sm">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <button className="mx-auto mt-2 flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <Input
                  value={slide.title}
                  onChange={(event) =>
                    onUpdateSlide(slide.id, { title: event.target.value })
                  }
                  placeholder="输入幻灯片标题..."
                  className="h-10 rounded-xl border-zinc-200 bg-white/80 text-sm font-medium shadow-none focus-visible:ring-blue-300"
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
                        keyPoints: event.target.value
                          .split("\n")
                          .filter(Boolean),
                      })
                    }
                    placeholder="每行一个知识点..."
                    className="min-h-[96px] rounded-xl border-zinc-200 bg-white/80 text-sm leading-6 focus-visible:ring-blue-300"
                    disabled={isGenerating || isOutlineHydrating}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    预计 {slide.estimatedMinutes} 分钟
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {slide.keyPoints.length} 个知识点
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-400 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onDuplicateSlide(slide)}>
                      <Copy className="mr-2 h-4 w-4" />
                      复制幻灯片
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteSlide(slide.id);
                      }}
                      className="text-red-600 focus:text-red-600"
                      disabled={
                        slides.length <= 1 || isGenerating || isOutlineHydrating
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
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
        whileHover={{ scale: 1.008 }}
        whileTap={{ scale: 0.995 }}
        onClick={onAddSlide}
        disabled={isGenerating || isOutlineHydrating}
        className="w-full rounded-2xl border border-dashed border-zinc-300 bg-white/80 px-4 py-3 text-sm font-medium text-zinc-500 transition-all hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          添加新幻灯片
        </span>
      </motion.button>
    </div>
  );
}
