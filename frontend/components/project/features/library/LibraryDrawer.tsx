"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, RefreshCw, X } from "lucide-react";
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
    currentLibraryNameDraft,
    setCurrentLibraryNameDraft,
    currentLibraryDescriptionDraft,
    setCurrentLibraryDescriptionDraft,
    currentLibraryGradeLevelDraft,
    setCurrentLibraryGradeLevelDraft,
    currentLibraryVisibilityDraft,
    setCurrentLibraryVisibilityDraft,
    currentLibraryReferenceableDraft,
    setCurrentLibraryReferenceableDraft,
    resetCurrentLibraryDrafts,
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const headerTitle = currentLibrarySettings?.name?.trim() || "引用库面板";
  const headerId = currentLibrarySettings?.id || projectId;
  const isRefreshingAny =
    referencesState.loading ||
    librariesState.loading ||
    currentLibraryState.loading ||
    currentLibrarySaving;
  const handleReloadAll = async () => {
    await Promise.all([
      loadReferences(),
      loadAvailableLibraries(),
      loadCurrentLibrarySettings(),
    ]);
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
            className="project-library-overlay fixed inset-0 z-50 bg-[rgba(10,10,12,0.24)] backdrop-blur-[14px]"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            key="library-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="project-library-drawer fixed inset-x-4 bottom-4 top-[54px] z-50 flex flex-col overflow-hidden rounded-3xl border border-zinc-200/80 bg-[linear-gradient(155deg,rgba(253,255,255,0.92),rgba(245,247,250,0.78))] shadow-[0_36px_90px_-54px_rgba(10,10,10,0.52)] backdrop-blur-[16px] md:inset-x-auto md:bottom-5 md:right-5 md:top-[56px] md:w-[min(760px,calc(100vw-40px))]"
            style={{ willChange: "transform, opacity" }}
            role="dialog"
            aria-modal="true"
            aria-label="项目库面板"
          >
            <div className="project-library-header relative shrink-0 overflow-hidden border-b border-zinc-200/70 bg-[linear-gradient(142deg,rgba(255,255,255,0.74),rgba(239,242,246,0.5))] backdrop-blur-[12px] px-6 py-5">
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-zinc-300/18 blur-3xl" />
              <div className="pointer-events-none absolute -left-14 -bottom-16 h-48 w-48 rounded-full bg-zinc-200/16 blur-3xl" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-[0_12px_24px_-14px_rgba(0,0,0,0.65)]">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className="truncate text-[26px] font-semibold tracking-tight text-[var(--project-text-primary)]"
                        title={headerTitle}
                      >
                        {headerTitle}
                      </h2>
                      <span className="rounded-full border border-zinc-200/85 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                        库 ID
                      </span>
                      <span
                        className="max-w-[320px] truncate rounded-full border border-zinc-200/80 bg-white/78 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700"
                        title={headerId}
                      >
                        {headerId}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--project-control-muted)]">
                      管理当前库设置、可引入库与已建立引用关系
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 360, damping: 24 }}
                    onClick={() => void handleReloadAll()}
                    className="rounded-xl border border-zinc-200/85 bg-white/82 p-2 text-[var(--project-control-muted)] transition-colors hover:bg-white hover:text-[var(--project-control-text)]"
                    title="刷新全部数据"
                    aria-label="刷新全部数据"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isRefreshingAny ? "animate-spin" : ""}`}
                    />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 360, damping: 24 }}
                    onClick={() => onOpenChange(false)}
                    className="project-library-close-btn rounded-xl border border-zinc-200/85 bg-white/82 p-2 text-[var(--project-control-muted)] transition-colors hover:bg-white hover:text-[var(--project-control-text)]"
                    aria-label="关闭库面板"
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </div>
              </div>
              <div className="relative z-10 mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-[var(--project-control-muted)]">
                  支持 `Esc` 快速关闭，或点右上角关闭按钮
                </p>
                <p className="text-[11px] text-[var(--project-control-muted)]">
                  数据变更后建议执行一次全量刷新
                </p>
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
                  currentLibraryNameDraft={currentLibraryNameDraft}
                  setCurrentLibraryNameDraft={setCurrentLibraryNameDraft}
                  currentLibraryDescriptionDraft={currentLibraryDescriptionDraft}
                  setCurrentLibraryDescriptionDraft={
                    setCurrentLibraryDescriptionDraft
                  }
                  currentLibraryGradeLevelDraft={currentLibraryGradeLevelDraft}
                  setCurrentLibraryGradeLevelDraft={
                    setCurrentLibraryGradeLevelDraft
                  }
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
                  onResetCurrentLibraryDrafts={resetCurrentLibraryDrafts}
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


