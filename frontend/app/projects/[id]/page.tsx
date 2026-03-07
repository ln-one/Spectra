"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Group, Panel } from "react-resizable-panels";
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
  stiffness: 400,
  damping: 35,
} as const;

const overlayBgVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.25 }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, delay: 0.1 }
  },
};

const mainPanelVariants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    x: -30,
  },
  animate: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: springConfig,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    x: -30,
    transition: { duration: 0.2 }
  },
};

const sidePanelVariants = {
  initial: (index: number) => ({
    opacity: 0,
    x: 80,
    scale: 0.92,
  }),
  animate: (index: number) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      ...springConfig,
      delay: 0.12 + index * 0.06,
    }
  }),
  exit: (index: number) => ({
    opacity: 0,
    x: 80,
    scale: 0.92,
    transition: {
      duration: 0.18,
      delay: index * 0.02,
    }
  }),
};

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
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
      <div className="min-h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
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

      <div className="flex-1 min-h-0 relative px-2.5 py-2.5">
        <Group orientation="horizontal" className="h-full gap-0">
          <Panel defaultSize="25%" minSize="20%" maxSize="35%">
            <StudioPanel onToolClick={handleToolClick} />
          </Panel>

          <Panel defaultSize="50%" minSize="35%">
            <ChatPanel projectId={projectId} />
          </Panel>

          <Panel defaultSize="25%" minSize="20%" maxSize="35%">
            <SourcesPanel projectId={projectId} />
          </Panel>
        </Group>

        <AnimatePresence mode="wait">
          {layoutMode === "expanded" && (
            <motion.div
              key="expanded-overlay"
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 z-20 pointer-events-auto"
            >
              <motion.div
                variants={overlayBgVariants}
                className="absolute inset-0 bg-black/10 backdrop-blur-[3px]"
              />

              <motion.div
                variants={mainPanelVariants}
                className="absolute left-2.5 right-[30%] top-2.5 bottom-2.5"
              >
                <StudioExpandedPanel />
              </motion.div>

              <motion.div
                custom={0}
                variants={sidePanelVariants}
                className="absolute right-2.5 top-2.5 bottom-[52%] w-[27%]"
              >
                <div className="h-full bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
                  <ChatPanel projectId={projectId} />
                </div>
              </motion.div>

              <motion.div
                custom={1}
                variants={sidePanelVariants}
                className="absolute right-2.5 bottom-2.5 top-[52%] w-[27%]"
              >
                <div className="h-full bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
                  <SourcesPanel projectId={projectId} />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
