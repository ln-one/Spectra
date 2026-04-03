"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import { panelVariants, overlayVariants } from "./motion";
import { useLibraryDrawerData } from "./useLibraryDrawerData";
import { ReferencesTab } from "./tabs/ReferencesTab";

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onReferencesChanged?: () => void;
}

export function LibraryDrawer({
  open,
  onOpenChange,
  projectId,
  onReferencesChanged,
}: LibraryDrawerProps) {
  const {
    references,
    referencesState,
    librariesState,
    currentLibraryState,
    availableLibraries,
    currentLibrarySettings,
    currentLibrarySaving,
    currentLibraryVisibilityDraft,
    setCurrentLibraryVisibilityDraft,
    currentLibraryReferenceableDraft,
    setCurrentLibraryReferenceableDraft,
    newReferenceTarget,
    setNewReferenceTarget,
    newReferenceRelationType,
    setNewReferenceRelationType,
    newReferenceMode,
    setNewReferenceMode,
    newReferencePinnedVersion,
    setNewReferencePinnedVersion,
    newReferencePriority,
    setNewReferencePriority,
    loadReferences,
    loadAvailableLibraries,
    loadCurrentLibrarySettings,
    handleAddReference,
    handleDeleteReference,
    handleToggleReferenceStatus,
    handleUpdateReferencePriority,
    handleQuickAddReference,
    handleSaveCurrentLibrarySettings,
  } = useLibraryDrawerData(projectId, open);

  const handleReferenceChanged = async (task: () => Promise<void>) => {
    await task();
    onReferencesChanged?.();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="library-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            className="project-library-overlay fixed inset-0 z-50 bg-[var(--project-overlay)] backdrop-blur-[2px]"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            key="library-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="project-library-drawer fixed z-50 bottom-5 right-5 top-[76px] flex w-[460px] flex-col overflow-hidden rounded-3xl border border-white/50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.03)] backdrop-blur-2xl"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="project-library-header px-6 py-5 border-b border-[var(--project-control-border)] bg-[var(--project-control-bg)] relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 bg-[var(--project-logo-end)] text-[var(--project-logo-text)] rounded-[var(--project-chip-radius)] shadow-sm">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-[17px] font-bold text-[var(--project-text-primary)] leading-tight">
                      Library
                    </h2>
                    <p className="text-[12px] text-[var(--project-control-muted)] mt-0.5 leading-snug">
                      引用库管理
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  onClick={() => onOpenChange(false)}
                  className="project-library-close-btn p-1.5 rounded-[var(--project-chip-radius)] text-[var(--project-control-muted)] hover:text-[var(--project-control-text)] hover:bg-[var(--project-surface-muted)] transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </motion.button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
              <div className="mt-1 min-h-0 flex-1 overflow-auto pb-6 scrollbar-hide">
                <ReferencesTab
                  projectId={projectId}
                  references={references}
                  state={referencesState}
                  librariesState={librariesState}
                  currentLibraryState={currentLibraryState}
                  availableLibraries={availableLibraries}
                  currentLibrarySettings={currentLibrarySettings}
                  currentLibrarySaving={currentLibrarySaving}
                  currentLibraryVisibilityDraft={currentLibraryVisibilityDraft}
                  setCurrentLibraryVisibilityDraft={
                    setCurrentLibraryVisibilityDraft
                  }
                  currentLibraryReferenceableDraft={
                    currentLibraryReferenceableDraft
                  }
                  setCurrentLibraryReferenceableDraft={
                    setCurrentLibraryReferenceableDraft
                  }
                  newReferenceTarget={newReferenceTarget}
                  setNewReferenceTarget={setNewReferenceTarget}
                  newReferenceRelationType={newReferenceRelationType}
                  setNewReferenceRelationType={setNewReferenceRelationType}
                  newReferenceMode={newReferenceMode}
                  setNewReferenceMode={setNewReferenceMode}
                  newReferencePinnedVersion={newReferencePinnedVersion}
                  setNewReferencePinnedVersion={setNewReferencePinnedVersion}
                  newReferencePriority={newReferencePriority}
                  setNewReferencePriority={setNewReferencePriority}
                  onAddReference={() =>
                    handleReferenceChanged(handleAddReference)
                  }
                  onDeleteReference={(referenceId) =>
                    handleReferenceChanged(() =>
                      handleDeleteReference(referenceId)
                    )
                  }
                  onToggleReferenceStatus={(referenceId, currentStatus) =>
                    handleReferenceChanged(() =>
                      handleToggleReferenceStatus(referenceId, currentStatus)
                    )
                  }
                  onUpdateReferencePriority={(referenceId, priority) =>
                    handleReferenceChanged(() =>
                      handleUpdateReferencePriority(referenceId, priority)
                    )
                  }
                  onQuickAddReference={(targetProjectId, options) =>
                    handleReferenceChanged(() =>
                      handleQuickAddReference(targetProjectId, options)
                    )
                  }
                  onReload={loadReferences}
                  onReloadLibraries={loadAvailableLibraries}
                  onReloadCurrentLibrarySettings={loadCurrentLibrarySettings}
                  onSaveCurrentLibrarySettings={handleSaveCurrentLibrarySettings}
                />
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
