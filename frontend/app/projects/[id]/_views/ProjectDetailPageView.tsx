"use client";

import { motion } from "framer-motion";
import {
  ChatPanel,
  LibraryDrawer,
  ProjectHeader,
  SourcesPanel,
  StudioPanel,
} from "@/components/project";
import { LightRays } from "@/components/ui/light-rays";
import {
  ProjectDetailLoading,
  ProjectDetailNotFound,
} from "./ProjectDetailStates";
import {
  HEADER_TO_PANEL_GAP,
  PAGE_GAP,
  PANEL_GAP,
  PANEL_TOP_INSET,
  springConfig,
} from "./constants";
import { getProjectTheme, getProjectThemeStyle } from "./theme";
import { useProjectDetailController } from "./useProjectDetailController";

export default function ProjectDetailPage() {
  const {
    router,
    project,
    isLoading,
    projectId,
    isExpanded,
    sessionOptions,
    activeSessionId,
    isCreatingSession,
    isLibraryOpen,
    setIsLibraryOpen,
    selectedThemePreset,
    setSelectedThemePreset,
    panelAreaRef,
    studioWidth,
    chatWidth,
    expandedStudioWidth,
    expandedChatHeight,
    handleToolClick,
    handleChangeSession,
    handleCreateSession,
    handleMouseDown,
    sourcesWidthPercent,
    isSourcesCollapsedByWidth,
    toggleSourcesCollapsed,
    isExpandedSourcesCollapsedByHeight,
    handleToggleExpandedSources,
  } = useProjectDetailController();

  if (isLoading) {
    return <ProjectDetailLoading />;
  }

  if (!project) {
    return <ProjectDetailNotFound onBack={() => router.push("/projects")} />;
  }

  const sourcesWidth = sourcesWidthPercent;
  const activeTheme = getProjectTheme(selectedThemePreset);
  const pageThemeStyle = getProjectThemeStyle(selectedThemePreset);

  return (
    <div
      className="h-screen flex flex-col bg-[var(--project-bg-base)] overflow-hidden relative"
      style={pageThemeStyle}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, var(--project-bg-glow), transparent 42%), linear-gradient(135deg, var(--project-bg-start), var(--project-bg-end))",
        }}
      />
      <LightRays
        count={7}
        color={activeTheme.rayColor}
        blur={40}
        speed={18}
        length="90vh"
        className="opacity-80"
      />

      <ProjectHeader
        sessions={sessionOptions}
        activeSessionId={activeSessionId}
        onChangeSession={handleChangeSession}
        onCreateSession={handleCreateSession}
        isCreatingSession={isCreatingSession}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        selectedThemePreset={selectedThemePreset}
        onThemePresetChange={setSelectedThemePreset}
      />

      <div className="flex-1 min-h-0 relative">
        <motion.div
          ref={panelAreaRef}
          className="absolute"
          style={{
            top: HEADER_TO_PANEL_GAP,
            right: 0,
            bottom: 0,
            left: 0,
          }}
          initial={false}
        >
          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: PAGE_GAP,
              top: PANEL_TOP_INSET,
              width: isExpanded
                ? `calc(${expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: `calc(100% - ${PANEL_TOP_INSET + PAGE_GAP}px)`,
            }}
            transition={springConfig}
          >
            <StudioPanel onToolClick={handleToolClick} />
          </motion.div>

          <motion.div
            className="absolute cursor-col-resize z-10"
            style={{
              top: PANEL_TOP_INSET,
              height: `calc(100% - ${PANEL_TOP_INSET + PAGE_GAP}px)`,
            }}
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`
                : `calc(${studioWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
              width: PANEL_GAP,
            }}
            transition={springConfig}
            onMouseDown={(event) =>
              handleMouseDown(
                event,
                isExpanded ? "expanded-studio-right" : "studio-chat"
              )
            }
          />

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth}% + ${PANEL_GAP / 2}px)`,
              top: PANEL_TOP_INSET,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${chatWidth}% - ${PANEL_GAP}px)`,
              height: isExpanded
                ? `calc(${expandedChatHeight}% - ${PANEL_TOP_INSET + PANEL_GAP / 2}px)`
                : `calc(100% - ${PANEL_TOP_INSET + PAGE_GAP}px)`,
            }}
            transition={springConfig}
          >
            <ChatPanel projectId={projectId} />
          </motion.div>

          {!isExpanded ? (
            <motion.div
              className="absolute cursor-col-resize z-10"
              style={{
                top: PANEL_TOP_INSET,
                height: `calc(100% - ${PANEL_TOP_INSET + PAGE_GAP}px)`,
              }}
              initial={false}
              animate={{
                left: `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(event) => handleMouseDown(event, "chat-sources")}
            />
          ) : null}

          {isExpanded ? (
            <motion.div
              className="absolute cursor-row-resize z-10"
              style={{
                left: `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`,
              }}
              initial={false}
              animate={{
                top: `calc(${expandedChatHeight}% + ${PANEL_GAP / 2 - PANEL_GAP}px)`,
                width: `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
                height: PANEL_GAP,
              }}
              transition={springConfig}
              onMouseDown={(event) =>
                handleMouseDown(event, "expanded-chat-sources")
              }
            />
          ) : null}

          <motion.div
            layout
            className="absolute"
            initial={false}
            animate={{
              left: isExpanded
                ? `calc(${expandedStudioWidth}% + ${PANEL_GAP / 2}px)`
                : `calc(${studioWidth + chatWidth}% + ${PANEL_GAP / 2}px)`,
              top: isExpanded
                ? `calc(${expandedChatHeight}% + ${PANEL_GAP / 2}px)`
                : PANEL_TOP_INSET,
              width: isExpanded
                ? `calc(${100 - expandedStudioWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(${sourcesWidth}% - ${PAGE_GAP + PANEL_GAP / 2}px)`,
              height: isExpanded
                ? `calc(${100 - expandedChatHeight}% - ${PAGE_GAP + PANEL_GAP / 2}px)`
                : `calc(100% - ${PANEL_TOP_INSET + PAGE_GAP}px)`,
            }}
            transition={springConfig}
          >
            <SourcesPanel
              projectId={projectId}
              isCollapsed={isSourcesCollapsedByWidth}
              onToggleCollapsed={toggleSourcesCollapsed}
              isStudioExpanded={isExpanded}
              isExpandedContentCollapsed={isExpandedSourcesCollapsedByHeight}
              onToggleExpandedContentCollapsed={handleToggleExpandedSources}
            />
          </motion.div>
        </motion.div>
      </div>

      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <p className="text-[10px] text-[var(--project-caption)]">
          Spectra 输出内容可能存在偏差，请在课堂使用前进行复核。
        </p>
      </div>

      <LibraryDrawer
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        projectId={projectId}
      />
    </div>
  );
}
