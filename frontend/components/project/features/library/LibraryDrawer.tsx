"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
            className="project-library-overlay fixed inset-0 z-50 bg-black/20 backdrop-blur-[6px]"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            key="library-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="project-library-drawer fixed inset-x-3 bottom-3 top-[72px] z-50 flex flex-col overflow-hidden rounded-3xl border border-white/65 bg-[var(--project-surface-elevated)] shadow-[0_26px_80px_-20px_rgba(0,0,0,0.3)] backdrop-blur-2xl md:inset-x-auto md:bottom-4 md:right-4 md:top-[76px] md:w-[min(560px,calc(100vw-32px))]"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="project-library-header relative shrink-0 overflow-hidden border-b border-[var(--project-control-border)] bg-gradient-to-br from-amber-50/75 via-white/95 to-white px-6 py-5">
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-amber-400/12 blur-3xl" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--project-text-primary)]">
                      引用库面板
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--project-control-muted)]">
                      管理当前库设置、可引入库与已建立引用关系
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24 }}
                  onClick={() => onOpenChange(false)}
                  className="project-library-close-btn rounded-xl border border-zinc-200/80 bg-white/80 p-2 text-[var(--project-control-muted)] transition-colors hover:bg-white hover:text-[var(--project-control-text)]"
                  aria-label="关闭库面板"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-5 py-4">
              <div className="pb-5">
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
            </ScrollArea>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
