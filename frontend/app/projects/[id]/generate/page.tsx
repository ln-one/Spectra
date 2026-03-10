"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Play, Share2, Edit3, Layout, Image as ImageIcon, 
  Sparkles, Check, Loader2, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { previewApi } from "@/lib/api/preview";
import { components } from "@/lib/types/api";

type Slide = components["schemas"]["Slide"];

// --- Components ---

const SlideCard = ({ slide, isActive }: { slide: Slide; isActive: boolean }) => {
  return (
    <div 
      id={slide.id || `slide-${slide.index}`}
      data-index={slide.index}
      className={cn(
        "slide-card bg-card border rounded-2xl p-8 md:p-12 mb-12 shadow-sm transition-all duration-300 w-full min-h-[400px] flex flex-col",
        isActive ? "ring-2 ring-primary/20 shadow-md translate-x-1" : "hover:shadow-md hover:-translate-y-1"
      )}
    >
      {slide.title && (
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center md:text-left title-text">
          {slide.title}
        </h2>
      )}
      
      <div className="flex-1 prose prose-lg dark:prose-invert max-w-none text-muted-foreground prose-h1:text-foreground prose-h2:text-foreground prose-h3:text-foreground prose-strong:text-foreground">
        {slide.content ? (
           <ReactMarkdown remarkPlugins={[remarkGfm]}>
             {slide.content}
           </ReactMarkdown>
        ) : (
          <div className="flex items-center justify-center h-full opacity-50">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>
      
      {/* Sources tags if any */}
      {slide.sources && slide.sources.length > 0 && (
        <div className="mt-8 pt-4 border-t flex flex-wrap gap-2">
          {slide.sources.map((source, idx) => (
             <span key={idx} className="text-xs bg-muted/60 text-muted-foreground px-2 py-1 rounded-full border flex items-center gap-1">
               📖 {source.filename}
               {source.page_number && ` (P${source.page_number})`}
             </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default function GeneratePreviewPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState("生成结果");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);

  const { generationSession, generationHistory } = useProjectStore();
  
  const activeSessionId = generationSession?.session.session_id || 
                         (generationHistory.length > 0 ? generationHistory[0].sessionId : null);

  // Hook into events
  const { isConnected, latestEvent } = useGenerationEvents(
    activeSessionId || '', 
    { enabled: !!activeSessionId }
  );

  const loadSlides = useCallback(async () => {
    if (!activeSessionId) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await previewApi.getSessionPreview(activeSessionId);
      if (response.success && response.data.slides) {
        setSlides(response.data.slides.sort((a,b) => a.index - b.index));
      }
    } catch (error) {
      console.error("Failed to load slides preview:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    loadSlides();
  }, [loadSlides]);

  // Handle SSE updates
  useEffect(() => {
    if (latestEvent?.event_type === "slide.updated" && latestEvent.payload?.slide) {
      const updatedSlide = latestEvent.payload.slide as Slide;
      setSlides(prev => {
        const idx = prev.findIndex(s => (s.id && s.id === updatedSlide.id) || s.index === updatedSlide.index);
        if (idx !== -1) {
          const newSlides = [...prev];
          newSlides[idx] = { ...newSlides[idx], ...updatedSlide };
          return newSlides.sort((a,b) => a.index - b.index);
        } else {
          return [...prev, updatedSlide].sort((a, b) => a.index - b.index);
        }
      });
    } else if (latestEvent?.event_type === "task.completed" || latestEvent?.state === "SUCCESS") {
      loadSlides();
    }
  }, [latestEvent, loadSlides]);

  // Scroll Spy Logic
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Using IntersectionObserver directly on the container children
    const handleScroll = () => {
      if (!containerRef.current) return;
      const slideElements = containerRef.current.querySelectorAll('.slide-card');
      let currentActiveIndex = activeSlideIndex;
      
      // Simple offset calculation
      const containerTop = containerRef.current.scrollTop;
      const containerCenter = containerTop + containerRef.current.clientHeight * 0.4;

      slideElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const top = htmlEl.offsetTop;
        const bottom = top + htmlEl.offsetHeight;
        
        if (containerCenter >= top && containerCenter <= bottom) {
          const idxStr = htmlEl.getAttribute('data-index');
          if (idxStr) {
            currentActiveIndex = parseInt(idxStr, 10);
          }
        }
      });
      
      if (currentActiveIndex !== activeSlideIndex) {
        setActiveSlideIndex(currentActiveIndex);
      }
    };
    
    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Call once initially to set the first slide if needed
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeSlideIndex, slides]);

  // Smooth Scroll to Slide
  const scrollToSlide = useCallback((index: number) => {
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20">
        
        {/* 1. 顶部固定导航栏 (Fixed Header) */}
        <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b bg-background/95 backdrop-blur z-50 shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            
            {/* 标题原位编辑 */}
            <div className="relative flex items-center">
              {isEditingTitle ? (
                <div className="flex items-center gap-1">
                  <Input 
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    className="h-8 max-w-[200px] text-sm font-semibold border-primary/30 focus-visible:ring-1 focus-visible:ring-primary"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                    onBlur={() => setIsEditingTitle(false)}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => setIsEditingTitle(false)}>
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div 
                  className="px-3 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group flex items-center gap-2"
                  onClick={() => setIsEditingTitle(true)}
                >
                  <span className="text-sm font-semibold truncate max-w-[200px] md:max-w-xs">{projectTitle}</span>
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            
            {isConnected && (
              <div className="ml-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-primary tracking-wider">实时同步</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full h-9">
              <Download className="w-4 h-4 mr-2" />
              导出
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full h-9">
              <Share2 className="w-4 h-4 mr-2" />
              分享
            </Button>
            <Button size="sm" className="rounded-full h-9 bg-foreground text-background hover:bg-foreground/90 transition-transform active:scale-95">
              <Play className="w-4 h-4 mr-2 fill-current" />
              演示
            </Button>
          </div>
        </header>

        {/* 2. 核心阅读区 (Main Scrolling Canvas) */}
        <main 
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-muted/20 relative scroll-smooth overflow-x-hidden p-4 md:p-8"
        >
          {isLoading ? (
             <div className="flex flex-col items-center justify-center h-full opacity-70">
               <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
               <p className="text-sm text-muted-foreground animate-pulse">正在加载课件内容...</p>
             </div>
          ) : slides.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full opacity-70">
               <ImageIcon className="w-12 h-12 text-muted-foreground/30 mb-4" />
               <p className="text-sm text-muted-foreground">暂无幻灯片数据，请先生成。</p>
             </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full pb-32" ref={slidesRef}>
              <AnimatePresence>
                {slides.map((slide, i) => (
                  <motion.div
                    key={slide.id || `s-${i}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: i * 0.05 }}
                  >
                    <SlideCard slide={slide} isActive={activeSlideIndex === slide.index} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </main>

        {/* 3. 右侧悬浮工具栏 (Floating Toolbar) */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 hidden sm:flex"
        >
          <div className="bg-card/90 border shadow-xl rounded-full flex flex-col p-1.5 gap-1.5 backdrop-blur-xl">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">编辑内容</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10 transition-colors">
                  <Layout className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">更换排版</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10 transition-colors">
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">替换配图</TooltipContent>
            </Tooltip>

            <div className="h-px w-5 mx-auto bg-border/80 my-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-violet-500 hover:text-violet-600 hover:bg-violet-50 w-10 h-10 transition-colors shadow-inner">
                  <Sparkles className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-violet-600 text-white border-violet-700">AI 智能润色</TooltipContent>
            </Tooltip>
          </div>
        </motion.div>

        {/* 4. 底部缩略图导航栏 (Bottom Filmstrip) */}
        {slides.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5, type: "spring", damping: 25 }}
            className="fixed bottom-0 left-0 w-full h-24 bg-background/85 backdrop-blur-md border-t z-40 flex items-center justify-center px-4"
          >
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-3 px-4 max-w-full">
              {slides.map((slide) => {
                const isActive = activeSlideIndex === slide.index;
                return (
                  <button
                    key={`thumb-${slide.id || slide.index}`}
                    onClick={() => scrollToSlide(slide.index)}
                    className={cn(
                      "relative group h-14 shrink-0 transition-all duration-300 rounded-xl overflow-hidden border-2 text-left flex flex-col justify-end p-2.5",
                      isActive 
                        ? "w-36 border-primary bg-primary/10 shadow-sm" 
                        : "w-20 border-border/50 bg-muted/50 hover:border-primary/40 hover:bg-muted focus:outline-none"
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none" />
                    
                    <span className={cn(
                      "text-[10px] font-bold z-10 truncate absolute top-1.5 left-2 bg-background/60 backdrop-blur rounded px-1.5",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}>
                      {slide.index}
                    </span>
                    
                    {isActive && (
                      <motion.span 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-semibold z-10 truncate text-foreground leading-tight mt-auto block drop-shadow-sm"
                      >
                        {slide.title || `第 ${slide.index} 页`}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

      </div>
    </TooltipProvider>
  );
}
