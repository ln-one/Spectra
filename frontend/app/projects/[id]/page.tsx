"use client";

import { useEffect } from "react";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

const springTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
} as const;

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500">加载中...</span>
        </motion.div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
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
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      <ProjectHeader />

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {layoutMode === "normal" ? (
            <motion.div
              key="normal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springTransition}
              className="h-full"
            >
              <ResizablePanelGroup orientation="horizontal" className="h-full">
                <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                  <motion.div
                    layout
                    transition={springTransition}
                    className="h-full border-r border-gray-100"
                  >
                    <StudioPanel onToolClick={handleToolClick} />
                  </motion.div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={50} minSize={35}>
                  <motion.div
                    layout
                    transition={springTransition}
                    className="h-full border-r border-gray-100"
                  >
                    <ChatPanel projectId={projectId} />
                  </motion.div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                  <motion.div layout transition={springTransition} className="h-full">
                    <SourcesPanel projectId={projectId} />
                  </motion.div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springTransition}
              className="h-full relative"
            >
              <motion.div
                layout
                transition={springTransition}
                className="absolute inset-0 left-0 right-[25%]"
              >
                <StudioExpandedPanel />
              </motion.div>

              <motion.div
                layout
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                transition={springTransition}
                className="absolute right-0 top-0 bottom-[52%] w-[25%] m-3"
              >
                <div className="h-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 overflow-hidden">
                  <ChatPanel projectId={projectId} />
                </div>
              </motion.div>

              <motion.div
                layout
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                transition={{ ...springTransition, delay: 0.05 }}
                className="absolute right-0 bottom-0 top-[52%] w-[25%] m-3"
              >
                <div className="h-full bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 overflow-hidden">
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
