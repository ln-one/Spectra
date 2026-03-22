"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import { HeaderActions } from "./components/HeaderActions";
import { ProjectNameEditor } from "./components/ProjectNameEditor";
import { SessionSwitcher } from "./components/SessionSwitcher";
import type { SessionSwitcherItem } from "./types";
import type { ThemePresetId } from "./theme";

interface ProjectHeaderProps {
  sessions: SessionSwitcherItem[];
  activeSessionId: string | null;
  onChangeSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatingSession: boolean;
  onOpenLibrary: () => void;
  selectedThemePreset: ThemePresetId;
  onThemePresetChange: (themeId: ThemePresetId) => void;
}

export type { SessionSwitcherItem } from "./types";
export type { ThemePresetId } from "./theme";

export function ProjectHeader({
  sessions,
  activeSessionId,
  onChangeSession,
  onRenameSession,
  onDeleteSession,
  onCreateSession,
  isCreatingSession,
  onOpenLibrary,
  selectedThemePreset,
  onThemePresetChange,
}: ProjectHeaderProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const projectName = useProjectStore((state) => state.project?.name);
  const updateProjectName = useProjectStore((state) => state.updateProjectName);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="project-header-shell h-[var(--project-header-height)] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6 z-50 relative"
    >
      <div className="project-header-left flex min-w-0 items-center gap-4">
        <Link
          href="/projects"
          className="flex items-center gap-2 group relative"
        >
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            className="project-header-logo w-9 h-9 rounded-2xl bg-[linear-gradient(135deg,var(--project-logo-start),var(--project-logo-end))] flex items-center justify-center shadow-md shadow-zinc-900/20 relative overflow-hidden"
          >
            <div className="project-header-logo-gloss absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sparkles className="w-4 h-4 text-[var(--project-logo-text)]" />
          </motion.div>
        </Link>

        <ProjectNameEditor
          projectName={projectName}
          onSave={(name) => {
            void updateProjectName(name);
          }}
        />
      </div>

      <SessionSwitcher
        sessions={sessions}
        activeSessionId={activeSessionId}
        onChangeSession={onChangeSession}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
        onCreateSession={onCreateSession}
        isCreatingSession={isCreatingSession}
      />

      <HeaderActions
        user={user}
        onLogout={logout}
        onOpenLibrary={onOpenLibrary}
        selectedThemePreset={selectedThemePreset}
        onThemePresetChange={onThemePresetChange}
      />
    </motion.header>
  );
}
