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
    newMemberUserId,
    setNewMemberUserId,
    loadReferences,
    loadVersions,
    loadArtifacts,
    loadMembers,
    loadChanges,
    handleAddReference,
    handleDeleteReference,
    handleQuickCreateArtifact,
    handleAddMember,
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
            className="fixed inset-0 z-50 bg-black/15 backdrop-blur-[2px]"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            key="library-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed z-50 right-5 top-[76px] bottom-5 w-[480px] rounded-3xl bg-zinc-50/97 backdrop-blur-2xl border border-white/50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden"
            style={{ willChange: "transform, opacity" }}
          >
            <div className="px-6 py-5 border-b border-zinc-200/60 bg-white/50 relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 bg-zinc-900 text-white rounded-lg shadow-sm">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-[17px] font-bold text-zinc-900 leading-tight">
                      Library
                    </h2>
                    <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug">
                      资源 路 版本 路 工件 路 成员 路 变更
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
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
                <TabsList className="grid grid-cols-5 w-full bg-zinc-200/50 backdrop-blur-md border border-zinc-200/80 rounded-xl p-1 gap-1 h-auto shrink-0">
                  <TabsTrigger
                    value="references"
                    className="text-[13px] font-semibold py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-zinc-900 transition-all text-zinc-500"
                  >
                    引用
                  </TabsTrigger>
                  <TabsTrigger
                    value="versions"
                    className="text-[13px] font-semibold py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-zinc-900 transition-all text-zinc-500"
                  >
                    版本
                  </TabsTrigger>
                  <TabsTrigger
                    value="artifacts"
                    className="text-[13px] font-semibold py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-zinc-900 transition-all text-zinc-500"
                  >
                    工件
                  </TabsTrigger>
                  <TabsTrigger
                    value="members"
                    className="text-[13px] font-semibold py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-zinc-900 transition-all text-zinc-500"
                  >
                    成员
                  </TabsTrigger>
                  <TabsTrigger
                    value="changes"
                    className="text-[13px] font-semibold py-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-zinc-900 transition-all text-zinc-500"
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
                    onAddReference={handleAddReference}
                    onDeleteReference={handleDeleteReference}
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
                    onCreateArtifact={handleQuickCreateArtifact}
                    onReload={loadArtifacts}
                  />
                  <MembersTab
                    members={members}
                    state={membersState}
                    newMemberUserId={newMemberUserId}
                    setNewMemberUserId={setNewMemberUserId}
                    onAddMember={handleAddMember}
                    onReload={loadMembers}
                  />
                  <ChangesTab
                    changes={changes}
                    state={changesState}
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
