"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { TokenStorage } from "@/lib/auth";
import { useProjectStore, type GenerationTool } from "@/stores/projectStore";
import {
  ProjectHeader,
  StudioPanel,
  StudioExpandedPanel,
  ChatPanel,
  SourcesPanel,
} from "@/components/project";
import { LightRays } from "@/components/ui/light-rays";

const springConfig = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 1,
} as const;

const PAGE_GAP = 24;
const PANEL_GAP = 12;

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const {
    project,
    isLoading,
    layoutMode,
    fetchProject,
    fetchFiles,
    fetchMessages,
    startGeneration,
    reset,
  } = useProjectStore();

  const [studioWidth, setStudioWidth] = useState(25);
  const [chatWidth, setChatWidth] = useState(50);
  const [sourcesWidth, setSourcesWidth] = useState(25);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthsRef = useRef({ studio: 0, chat: 0, sources: 0 });

  const isExpanded = layoutMode === "expanded";

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    fetchProject(projectId);
    fetchFiles(projectId);
    fetchMessages(projectId);

    return () => {
      reset();
    };
  }, [projectId, router, fetchProject, fetchFiles, fetchMessages, reset]);

  const handleToolClick = async (tool: GenerationTool) => {
    await startGeneration(projectId, tool);
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, handle: "studio-chat" | "chat-sources") => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthsRef.current = {
        studio: studioWidth,
        chat: chatWidth,
        sources: sourcesWidth,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;

        const deltaX = moveEvent.clientX - startXRef.current;
        const containerWidth = window.innerWidth - PAGE_GAP * 2;
        const deltaPercent = (deltaX / containerWidth) * 100;

        if (handle === "studio-chat") {
          const newStudio = Math.max(
            15,
            Math.min(40, startWidthsRef.current.studio + deltaPercent)
          );
          const newChat = Math.max(
            30,
            Math.min(60, startWidthsRef.current.chat - deltaPercent)
          );
          setStudioWidth(newStudio);
          setChatWidth(newChat);
        } else {
          const newChat = Math.max(
            30,
            Math.min(60, startWidthsRef.current.chat + deltaPercent)
          );
          const newSources = Math.max(
            15,
            Math.min(40, startWidthsRef.current.sources - deltaPercent)
          );
          setChatWidth(newChat);
          setSourcesWidth(newSources);
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [studioWidth, chatWidth, sourcesWidth]
  );

  if (isLoading) {
    return (
      <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
        <LightRays
          count={8}
          color="rgba(180, 200, 255, 0.15)"
          blur={40}
          speed={16}
          length="80vh"
          className="opacity-70"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 relative z-10"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">加载中...</span>
        </motion.div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
        <LightRays
          count={8}
          color="rgba(180, 200, 255, 0.15)"
          blur={40}
          speed={16}
          length="80vh"
          className="opacity-70"
        />
        <div className="text-center relative z-10">
          <p className="text-zinc-600">项目不存在</p>
          <button
            onClick={() => router.push("/projects")}
            className="mt-4 px-4 py-2 bg-zinc-900 text-white text-sm rounded-full hover:bg-zinc-800 transition-colors"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  const expandedStudioWidth = 70;

  return (
    <div className="h-screen flex flex-col bg-zinc-100 overflow-hidden relative">
      <LightRays
        count={10}
        color="rgba(200, 220, 255, 0.12)"
        blur={48}
        speed={18}
        length="90vh"
        className="opacity-80"
      />

      <ProjectHeader />

      <div className="flex-1 min-h-0 relative" style={{ padding: PAGE_GAP }}>
        <motion.div
          className="absolute inset-0"
          style={{ padding: PAGE_GAP }}
          initial={false}
        >
          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: PAGE_GAP,
              top: PAGE_GAP,
              width: isExpanded
                ? `calc(${expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <AnimatePresence mode="wait">
              {isExpanded ? (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <StudioExpandedPanel />
                </motion.div>
              ) : (
                <motion.div
                  key="normal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <StudioPanel onToolClick={handleToolClick} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {!isExpanded && (
            <motion.div
              className="absolute cursor-col-resize z-10"
              style={{
                top: PAGE_GAP,
                height: `calc(100% - ${PAGE_GAP * 2}px)`,
              }}
              initial={false}
              animate={{
                left: `calc(${studioWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(e) => handleMouseDown(e, "studio-chat")}
            />
          )}

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% + ${PANEL_GAP / 2}px)`,
              top: PAGE_GAP,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${chatWidth}% - ${PANEL_GAP}px)`,
              height: isExpanded
                ? `calc(50% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <ChatPanel projectId={projectId} />
          </motion.div>

          {!isExpanded && (
            <motion.div
              className="absolute cursor-col-resize z-10"
              style={{
                top: PAGE_GAP,
                height: `calc(100% - ${PAGE_GAP * 2}px)`,
              }}
              initial={false}
              animate={{
                left: `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(e) => handleMouseDown(e, "chat-sources")}
            />
          )}

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2}px)`,
              top: isExpanded
                ? `calc(50% + ${PANEL_GAP / 2}px)`
                : PAGE_GAP,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${sourcesWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: isExpanded
                ? `calc(50% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(100% - ${PAGE_GAP * 2}px)`,
            }}
            transition={springConfig}
          >
            <SourcesPanel projectId={projectId} />
          </motion.div>
        </motion.div>
      </div>

      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] text-zinc-400">
          Spectra 提供的内容未必准确，因此请仔细核查回答内容。
        </p>
      </div>
    </div>
  );
}
