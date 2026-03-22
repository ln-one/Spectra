"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { panelVariants, overlayVariants } from "./motion";
import { useLibraryDrawerData } from "./useLibraryDrawerData";
import { ArtifactsTab } from "./tabs/ArtifactsTab";
import { ChangesTab } from "./tabs/ChangesTab";
import { MembersTab } from "./tabs/MembersTab";
import { ReferencesTab } from "./tabs/ReferencesTab";
import { VersionsTab } from "./tabs/VersionsTab";

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function LibraryDrawer({
  open,
  onOpenChange,
  projectId,
}: LibraryDrawerProps) {
  const {
    activeTab,
    setActiveTab,
    references,
    versions,
    artifacts,
    members,
    changes,
    referencesState,
    versionsState,
    artifactsState,
    membersState,
    changesState,
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

    newArtifactType,
    setNewArtifactType,
    newArtifactVisibility,
    setNewArtifactVisibility,
    newArtifactMode,
    setNewArtifactMode,
    newArtifactSessionId,
    setNewArtifactSessionId,
    newArtifactBasedVersionId,
    setNewArtifactBasedVersionId,

    newMemberUserId,
    setNewMemberUserId,
    newMemberRole,
    setNewMemberRole,

    newChangeTitle,
    setNewChangeTitle,
    newChangeSummary,
    setNewChangeSummary,
    reviewComment,
    setReviewComment,

    loadReferences,
    loadVersions,
    loadArtifacts,
    loadMembers,
    loadChanges,
    handleAddReference,
    handleDeleteReference,
    handleToggleReferenceStatus,
    handleUpdateReferencePriority,
    handleCreateArtifact,
    handleDownloadArtifact,
    handleAddMember,
    handleUpdateMemberRole,
    handleToggleMemberStatus,
    handleDeleteMember,
    handleCreateCandidateChange,
    handleReviewCandidateChange,
  } = useLibraryDrawerData(projectId, open);

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
            className="project-library-drawer fixed z-50 right-5 top-[76px] bottom-5 w-[480px] rounded-3xl backdrop-blur-2xl border border-white/50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden"
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
                      资源 路 版本 路 工件 路 成员 路 变更
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

            <div className="flex-1 min-h-0 overflow-hidden px-5 py-4 flex flex-col">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 min-h-0 flex flex-col"
              >
                <TabsList className="project-library-tabs grid grid-cols-5 w-full backdrop-blur-md border border-[var(--project-control-border)] rounded-[var(--project-chip-radius)] p-1 gap-1 h-auto shrink-0">
                  <TabsTrigger
                    value="references"
                    className="project-library-tab-trigger text-[13px] font-semibold py-1.5 rounded-[var(--project-chip-radius)] data-[state=active]:bg-[var(--project-surface-elevated)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--project-control-text)] transition-all text-[var(--project-control-muted)]"
                  >
                    引用
                  </TabsTrigger>
                  <TabsTrigger
                    value="versions"
                    className="project-library-tab-trigger text-[13px] font-semibold py-1.5 rounded-[var(--project-chip-radius)] data-[state=active]:bg-[var(--project-surface-elevated)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--project-control-text)] transition-all text-[var(--project-control-muted)]"
                  >
                    版本
                  </TabsTrigger>
                  <TabsTrigger
                    value="artifacts"
                    className="project-library-tab-trigger text-[13px] font-semibold py-1.5 rounded-[var(--project-chip-radius)] data-[state=active]:bg-[var(--project-surface-elevated)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--project-control-text)] transition-all text-[var(--project-control-muted)]"
                  >
                    工件
                  </TabsTrigger>
                  <TabsTrigger
                    value="members"
                    className="project-library-tab-trigger text-[13px] font-semibold py-1.5 rounded-[var(--project-chip-radius)] data-[state=active]:bg-[var(--project-surface-elevated)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--project-control-text)] transition-all text-[var(--project-control-muted)]"
                  >
                    成员
                  </TabsTrigger>
                  <TabsTrigger
                    value="changes"
                    className="project-library-tab-trigger text-[13px] font-semibold py-1.5 rounded-[var(--project-chip-radius)] data-[state=active]:bg-[var(--project-surface-elevated)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--project-control-text)] transition-all text-[var(--project-control-muted)]"
                  >
                    变更
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 min-h-0 mt-4 overflow-auto scrollbar-hide pb-6">
                  <ReferencesTab
                    references={references}
                    state={referencesState}
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
                    onAddReference={handleAddReference}
                    onDeleteReference={handleDeleteReference}
                    onToggleReferenceStatus={handleToggleReferenceStatus}
                    onUpdateReferencePriority={handleUpdateReferencePriority}
                    onReload={loadReferences}
                  />
                  <VersionsTab
                    versions={versions}
                    state={versionsState}
                    onReload={loadVersions}
                  />
                  <ArtifactsTab
                    artifacts={artifacts}
                    state={artifactsState}
                    newArtifactType={newArtifactType}
                    setNewArtifactType={setNewArtifactType}
                    newArtifactVisibility={newArtifactVisibility}
                    setNewArtifactVisibility={setNewArtifactVisibility}
                    newArtifactMode={newArtifactMode}
                    setNewArtifactMode={setNewArtifactMode}
                    newArtifactSessionId={newArtifactSessionId}
                    setNewArtifactSessionId={setNewArtifactSessionId}
                    newArtifactBasedVersionId={newArtifactBasedVersionId}
                    setNewArtifactBasedVersionId={setNewArtifactBasedVersionId}
                    onCreateArtifact={handleCreateArtifact}
                    onDownloadArtifact={handleDownloadArtifact}
                    onReload={loadArtifacts}
                  />
                  <MembersTab
                    members={members}
                    state={membersState}
                    newMemberUserId={newMemberUserId}
                    setNewMemberUserId={setNewMemberUserId}
                    newMemberRole={newMemberRole}
                    setNewMemberRole={setNewMemberRole}
                    onAddMember={handleAddMember}
                    onUpdateMemberRole={handleUpdateMemberRole}
                    onToggleMemberStatus={handleToggleMemberStatus}
                    onDeleteMember={handleDeleteMember}
                    onReload={loadMembers}
                  />
                  <ChangesTab
                    changes={changes}
                    state={changesState}
                    newChangeTitle={newChangeTitle}
                    setNewChangeTitle={setNewChangeTitle}
                    newChangeSummary={newChangeSummary}
                    setNewChangeSummary={setNewChangeSummary}
                    reviewComment={reviewComment}
                    setReviewComment={setReviewComment}
                    onCreateCandidateChange={handleCreateCandidateChange}
                    onReviewCandidateChange={handleReviewCandidateChange}
                    onReload={loadChanges}
                  />
                </div>
              </Tabs>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
