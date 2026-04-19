"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
  pulseTarget?: boolean;
}

interface OnboardingTourProps {
  projectId: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "body",
    title: "欢迎使用 Spectra",
    content:
      "这是一个为您深度定制的 AI 教学协作中心。我们将通过 1 分钟带您熟悉这里的核心布局。",
  },
  {
    target: '[data-tour="session-switcher"]',
    title: "灵感分箱",
    content:
      "在这里管理不同的教学会话。每个会话拥有独立的上下文，方便您同时准备多个课程主题。",
    placement: "bottom",
    pulseTarget: true,
  },
  {
    target: '[data-tour="sources-panel"]',
    title: "知识底座",
    content:
      "导入您的教案、PDF 或参考资料。AI 将以此为基准进行深度理解，生成精准且符合您教学风格的内容。",
    placement: "right",
    pulseTarget: true,
  },
  {
    target: '[data-tour="chat-panel"]',
    title: "共创大脑",
    content:
      "在这里与 AI 实时交谈。您可以让它提炼大纲、设计教学互动，或针对特定知识点进行多维度拆解。",
    placement: "right",
    pulseTarget: true,
  },
  {
    target: '[data-tour="studio-panel"]',
    title: "成品工坊",
    content:
      "AI 生成的 PPT、教案、习题等成品会在这里实时预览。点击工具卡片，即可开启专属的生成流。",
    placement: "left",
    pulseTarget: true,
  },
  {
    target: '[data-tour="library-toggle"]',
    title: "数字资产库",
    content: "一键访问您的历史成果和全校共享的优质模板。",
    placement: "bottom",
    pulseTarget: true,
  },
];

export function OnboardingTour({ projectId }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const storageKey = `project-tour-seen:${projectId}`;

  useEffect(() => {
    const handleOpenTour = () => {
      setIsVisible(true);
      setCurrentStep(0);
    };
    window.addEventListener("spectra:open-tour", handleOpenTour);
    return () =>
      window.removeEventListener("spectra:open-tour", handleOpenTour);
  }, []);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem(storageKey);
    if (!hasSeenTour) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        setCurrentStep(0);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const updateTargetRect = useCallback(() => {
    if (currentStep < 0 || currentStep >= TOUR_STEPS.length) {
      setTargetRect(null);
      return;
    }

    const step = TOUR_STEPS[currentStep];
    if (step.target === "body") {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    const initialMeasureFrame = window.requestAnimationFrame(updateTargetRect);
    const interval = setInterval(updateTargetRect, 500); // Polling for layout shifts
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      window.cancelAnimationFrame(initialMeasureFrame);
      clearInterval(interval);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "true");
  };

  if (!isVisible) return null;

  const currentStepData = TOUR_STEPS[currentStep];

  return createPortal(
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <AnimatePresence>
        {/* SVG Mask Overlay */}
        <motion.div
          key="tour-mask-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 pointer-events-auto"
        >
          <svg className="h-full w-full">
            <defs>
              <mask id="tour-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    layoutId="tour-hole"
                    className="fill-black"
                    initial={{ rx: 16 }}
                    animate={{
                      x: (targetRect?.left ?? 0) - 4,
                      y: (targetRect?.top ?? 0) - 4,
                      width: (targetRect?.width ?? 0) + 8,
                      height: (targetRect?.height ?? 0) + 8,
                      rx: 16,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.5)"
              mask="url(#tour-mask)"
              className="backdrop-blur-[2px]"
            />
          </svg>
        </motion.div>

        {/* Pulse Indicator */}
        {targetRect && currentStepData.pulseTarget && (
          <motion.div
            key="tour-pulse-indicator"
            layoutId="tour-pulse"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              left: (targetRect?.left ?? 0) - 4,
              top: (targetRect?.top ?? 0) - 4,
              width: (targetRect?.width ?? 0) + 8,
              height: (targetRect?.height ?? 0) + 8,
            }}
            className="absolute rounded-2xl border-2 border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.3)] pointer-events-none"
            style={{ zIndex: 1001 }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-2xl bg-primary"
            />
          </motion.div>
        )}

        {/* Content Box */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{
            opacity: 1,
            scale: 1,
            ...(() => {
              if (!targetRect)
                return { left: "50%", top: "50%", x: "-50%", y: "-50%" };

              let left = 0;
              let top = 0;
              const margin = 20;
              const tooltipWidth = 340;
              const tooltipHeight = 280;

              if (currentStepData.placement === "right") {
                left = targetRect.right + margin;
                top =
                  targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
              } else if (currentStepData.placement === "left") {
                left = targetRect.left - tooltipWidth - margin;
                top =
                  targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
              } else if (currentStepData.placement === "top") {
                left =
                  targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                top = targetRect.top - tooltipHeight - margin;
              } else {
                // bottom
                left =
                  targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
                top = targetRect.bottom + margin;
              }

              // Boundary detection
              left = Math.max(
                margin,
                Math.min(window.innerWidth - tooltipWidth - margin, left)
              );
              top = Math.max(
                margin,
                Math.min(window.innerHeight - tooltipHeight - margin, top)
              );

              return { left, top, x: 0, y: 0 };
            })(),
          }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className={cn(
            "absolute w-[340px] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] p-6 pointer-events-auto border border-white/20 dark:border-white/10",
            "flex flex-col gap-4"
          )}
          style={{ zIndex: 1010 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-primary tracking-widest uppercase opacity-70 mb-0.5">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {currentStepData.title}
              </h3>
            </div>
            <button
              onClick={handleFinish}
              className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-colors self-start -mr-2 -mt-2"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          <div className="relative">
            <div className="absolute -left-3 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
              {currentStepData.content}
            </p>
          </div>

          <div className="flex items-center justify-between mt-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === currentStep ? 16 : 6,
                    backgroundColor:
                      i === currentStep ? "#18181b" : "rgba(24, 24, 27, 0.2)",
                  }}
                  className="h-1.5 rounded-full"
                />
              ))}
            </div>
            <div className="flex gap-2">
              {currentStep > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  className="rounded-xl h-9 px-4 text-zinc-500 hover:text-zinc-900"
                >
                  <ChevronLeft className="w-4 h-4 mr-1.5" />
                  上一步
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFinish}
                  className="rounded-xl h-9 px-4 text-zinc-400"
                >
                  跳过
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="rounded-xl h-9 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:scale-105 transition-transform"
              >
                {currentStep === TOUR_STEPS.length - 1 ? "开启探索" : "下一步"}
                {currentStep < TOUR_STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 ml-1.5" />
                )}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Tip Badge */}
        {targetRect && (
          <motion.div
            key="tour-tip-badge"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: 1,
              left: (targetRect?.left ?? 0) + (targetRect?.width ?? 0) / 2 - 50,
              top: (targetRect?.top ?? 0) - 40,
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full shadow-lg flex items-center gap-1.5"
            style={{ zIndex: 1002 }}
          >
            <Lightbulb className="w-3 h-3" />
            FOCUS AREA
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
