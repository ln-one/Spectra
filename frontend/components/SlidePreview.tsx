"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Presentation,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Slide {
  id: string;
  index: number;
  title: string;
  content: string;
  sources?: Array<{
    chunk_id: string;
    source_type: "video" | "document" | "ai_generated";
    filename: string;
    page_number?: number;
    timestamp?: string;
    preview_text?: string;
  }>;
}

interface SlidePreviewProps {
  slides?: Slide[];
  currentSlide?: number;
  onSlideChange?: (index: number) => void;
  slideId?: string;
  onGenerate?: () => void;
  isGenerating?: boolean;
  className?: string;
}

export function SlidePreview({
  slides = [],
  currentSlide: externalCurrentSlide,
  onSlideChange,
  slideId,
  onGenerate,
  isGenerating = false,
  className,
}: SlidePreviewProps) {
  const [internalCurrentSlide, setInternalCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "list">("preview");

  // Use internal state if slideId is provided but no external currentSlide
  const currentSlide = slideId !== undefined ? internalCurrentSlide : (externalCurrentSlide ?? internalCurrentSlide);

  const handleSlideChange = (index: number) => {
    if (onSlideChange) {
      onSlideChange(index);
    } else {
      setInternalCurrentSlide(index);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      handleSlideChange(currentSlide - 1);
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      handleSlideChange(currentSlide + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      handlePrevSlide();
    } else if (e.key === "ArrowRight") {
      handleNextSlide();
    }
  };

  if (slides.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Presentation className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">暂无生成的课件</p>
          {onGenerate && (
            <Button onClick={onGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Presentation className="mr-2 h-4 w-4" />
                  生成课件
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const currentSlideData = slides[currentSlide];

  return (
    <Card className={cn("w-full flex flex-col", className)} onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex items-center justify-between p-4 border-b">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "preview" | "list")}>
          <TabsList>
            <TabsTrigger value="preview">
              <Presentation className="h-4 w-4 mr-2" />
              预览
            </TabsTrigger>
            <TabsTrigger value="list">
              <FileText className="h-4 w-4 mr-2" />
              幻灯片列表
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevSlide}
            disabled={currentSlide === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {currentSlide + 1} / {slides.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextSlide}
            disabled={currentSlide >= slides.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CardContent className="flex-1 p-0">
        {viewMode === "preview" ? (
          <div className="flex h-full min-h-[400px]">
            <div className="flex-1 p-8 bg-gray-50 flex flex-col">
              <div className="bg-white rounded-lg shadow-sm flex-1 p-8 overflow-auto">
                <div className="max-w-2xl mx-auto">
                  <div className="aspect-video bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg mb-6 flex items-center justify-center">
                    <Presentation className="h-24 w-24 text-blue-200" />
                  </div>
                  <h2 className="text-2xl font-bold text-center mb-4">
                    {currentSlideData?.title || `第 ${currentSlide + 1} 页`}
                  </h2>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-gray-600 whitespace-pre-wrap">
                      {currentSlideData?.content || "暂无内容"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <ScrollArea className="w-72 border-l">
              <div className="p-4">
                <h3 className="font-semibold mb-3">本页参考来源</h3>
                {currentSlideData?.sources && currentSlideData.sources.length > 0 ? (
                  <div className="space-y-2">
                    {currentSlideData.sources.map((source, idx) => (
                      <div
                        key={idx}
                        className="p-2 text-sm bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 text-xs rounded",
                              source.source_type === "video"
                                ? "bg-red-100 text-red-700"
                                : source.source_type === "document"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                            )}
                          >
                            {source.source_type === "video"
                              ? "视频"
                              : source.source_type === "document"
                                ? "文档"
                                : "AI"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {source.filename}
                          </span>
                        </div>
                        {source.page_number && (
                          <p className="text-xs text-muted-foreground">
                            第 {source.page_number} 页
                          </p>
                        )}
                        {source.preview_text && (
                          <p className="text-xs mt-1 line-clamp-2">
                            {source.preview_text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无参考来源</p>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="p-4 grid grid-cols-2 gap-4">
              {slides.map((slide, idx) => (
                <div
                  key={slide.id}
                  className={cn(
                    "cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md",
                    idx === currentSlide
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-muted-foreground"
                  )}
                  onClick={() => handleSlideChange(idx)}
                >
                  <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 rounded mb-2 flex items-center justify-center">
                    <Presentation className="h-8 w-8 text-gray-300" />
                  </div>
                  <div className="text-sm">
                    <div className="font-medium truncate">
                      {slide.title || `第 ${idx + 1} 页`}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {slide.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default SlidePreview;
