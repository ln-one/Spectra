"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Layers,
  GitMerge,
  FileText,
  Users,
  GitPullRequest,
  AlertCircle,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { projectSpaceApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/client";
import type { components } from "@/lib/sdk/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProjectReference = components["schemas"]["ProjectReference"];
type ProjectVersion = components["schemas"]["ProjectVersion"];
type Artifact = components["schemas"]["Artifact"];
type ProjectMember = components["schemas"]["ProjectMember"];
type CandidateChange = components["schemas"]["CandidateChange"];

type TabState = {
  loading: boolean;
  error: string | null;
};

interface LibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

function formatLibraryError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.code === "FORBIDDEN") {
      return "权限不足：当前账号无法访问该库能力。";
    }
    if (
      error.status === 404 ||
      error.status === 501 ||
      error.code === "NOT_IMPLEMENTED"
    ) {
      return "后端未开放该能力（Phase 1 占位）。";
    }
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PaneState({
  state,
  hasData,
  emptyLabel,
  onRetry,
}: {
  state: TabState;
  hasData: boolean;
  emptyLabel: string;
  onRetry: () => void;
}) {
  if (state.loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-48 grid place-items-center text-zinc-500"
      >
        <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-200/50 bg-white/50 backdrop-blur-sm px-4 py-2 text-[13px] font-medium shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          加载中...
        </div>
      </motion.div>
    );
  }

  if (state.error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-48 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm rounded-2xl border border-red-100/60 bg-red-50/40 backdrop-blur-sm p-5 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3 opacity-80" />
          <p className="mb-4 text-[13px] text-red-700/90 font-medium leading-relaxed">
            {state.error}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="bg-white/60 backdrop-blur-sm hover:bg-white/80 border-red-200/60 text-red-600 rounded-xl h-8 px-4"
          >
            重试
          </Button>
        </div>
      </motion.div>
    );
  }

  if (!hasData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-48 grid place-items-center p-4"
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100/60 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 border border-zinc-200/40">
            <Layers className="w-5 h-5 text-zinc-400" />
          </div>
          <p className="text-[13px] text-zinc-500 font-medium">{emptyLabel}</p>
        </div>
      </motion.div>
    );
  }

  return null;
}

function RowCard({
  title,
  subtitle,
  action,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative rounded-2xl border border-zinc-200/50 bg-white/40 hover:bg-white/60 p-3.5 shadow-sm hover:shadow-md hover:border-zinc-300/60 transition-all duration-300 backdrop-blur-sm"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-white/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="mt-0.5 shrink-0 p-2 rounded-xl bg-zinc-100/60 backdrop-blur-sm text-zinc-500 group-hover:text-zinc-900 group-hover:bg-zinc-100 transition-colors border border-zinc-200/40">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-zinc-700 break-all leading-snug group-hover:text-zinc-900 transition-colors">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-[11px] font-medium text-zinc-400 tracking-wide">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action && (
          <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity mt-0.5">
            {action}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────
 * Floating panel overlay + animation variants
 * ────────────────────────────────────────── */

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, x: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 320,
      damping: 28,
      mass: 0.9,
    },
  },
  exit: {
    opacity: 0,
    x: 30,
    scale: 0.97,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
};

export function LibraryDrawer({
  open,
  onOpenChange,
  projectId,
}: LibraryDrawerProps) {
  const [activeTab, setActiveTab] = useState("references");

  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [changes, setChanges] = useState<CandidateChange[]>([]);

  const [referencesState, setReferencesState] = useState<TabState>({
    loading: false,
    error: null,
  });
  const [versionsState, setVersionsState] = useState<TabState>({
    loading: false,
    error: null,
  });
  const [artifactsState, setArtifactsState] = useState<TabState>({
    loading: false,
    error: null,
  });
  const [membersState, setMembersState] = useState<TabState>({
    loading: false,
    error: null,
  });
  const [changesState, setChangesState] = useState<TabState>({
    loading: false,
    error: null,
  });

  const [newReferenceTarget, setNewReferenceTarget] = useState("");
  const [newMemberUserId, setNewMemberUserId] = useState("");

  const loadReferences = async () => {
    setReferencesState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getReferences(projectId);
      setReferences(response.data.references ?? []);
      setReferencesState({ loading: false, error: null });
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "加载引用失败"),
      });
    }
  };

  const loadVersions = async () => {
    setVersionsState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getVersions(projectId);
      setVersions(response.data.versions ?? []);
      setVersionsState({ loading: false, error: null });
    } catch (error) {
      setVersionsState({
        loading: false,
        error: formatLibraryError(error, "加载版本失败"),
      });
    }
  };

  const loadArtifacts = async () => {
    setArtifactsState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getArtifacts(projectId);
      setArtifacts(response.data.artifacts ?? []);
      setArtifactsState({ loading: false, error: null });
    } catch (error) {
      setArtifactsState({
        loading: false,
        error: formatLibraryError(error, "加载工件失败"),
      });
    }
  };

  const loadMembers = async () => {
    setMembersState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getMembers(projectId);
      setMembers(response.data.members ?? []);
      setMembersState({ loading: false, error: null });
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "加载成员失败"),
      });
    }
  };

  const loadChanges = async () => {
    setChangesState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getCandidateChanges(projectId);
      setChanges(response.data.changes ?? []);
      setChangesState({ loading: false, error: null });
    } catch (error) {
      setChangesState({
        loading: false,
        error: formatLibraryError(error, "加载候选变更失败"),
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      loadReferences(),
      loadVersions(),
      loadArtifacts(),
      loadMembers(),
      loadChanges(),
    ]);
  }, [open, projectId]);

  const handleAddReference = async () => {
    const targetId = newReferenceTarget.trim();
    if (!targetId) return;
    try {
      await projectSpaceApi.createReference(projectId, {
        target_project_id: targetId,
        relation_type: "auxiliary",
        mode: "follow",
        priority: 10,
      });
      setNewReferenceTarget("");
      await loadReferences();
    } catch {
      // rely on list refresh state
    }
  };

  const handleDeleteReference = async (referenceId: string) => {
    try {
      await projectSpaceApi.deleteReference(projectId, referenceId);
      await loadReferences();
    } catch {
      // rely on list refresh state
    }
  };

  const handleQuickCreateArtifact = async () => {
    try {
      await projectSpaceApi.createArtifact(projectId, {
        type: "summary",
        visibility: "private",
        mode: "create",
      });
      await loadArtifacts();
    } catch {
      // rely on list refresh state
    }
  };

  const handleAddMember = async () => {
    const userId = newMemberUserId.trim();
    if (!userId) return;
    try {
      await projectSpaceApi.addMember(projectId, {
        user_id: userId,
        role: "viewer",
      });
      setNewMemberUserId("");
      await loadMembers();
    } catch {
      // rely on list refresh state
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop overlay */}
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

          {/* Floating panel */}
          <motion.div
            key="library-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed z-50 right-5 top-[76px] bottom-5 w-[480px] rounded-3xl bg-zinc-50/97 backdrop-blur-2xl border border-white/50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden"
            style={{ willChange: "transform, opacity" }}
          >
            {/* Header */}
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
                      资源 · 版本 · 工件 · 成员 · 变更
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

            {/* Body */}
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
                  <TabsContent value="references" className="mt-0">
                    <div className="flex gap-2 mb-4">
                      <Input
                        value={newReferenceTarget}
                        onChange={(event) =>
                          setNewReferenceTarget(event.target.value)
                        }
                        placeholder="输入 target_project_id"
                        className="h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddReference}
                        className="h-9 rounded-xl shadow-sm bg-zinc-600 hover:bg-zinc-700"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        新增
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={loadReferences}
                        className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                    <PaneState
                      state={referencesState}
                      hasData={references.length > 0}
                      emptyLabel="当前没有引用，先添加一个关联库。"
                      onRetry={loadReferences}
                    />
                    {!referencesState.loading &&
                    !referencesState.error &&
                    references.length > 0 ? (
                      <div className="space-y-3">
                        {references.map((item) => (
                          <RowCard
                            key={item.id}
                            icon={LinkIcon}
                            title={item.target_project_id}
                            subtitle={`${item.relation_type} · ${item.mode} · ${item.status}`}
                            action={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteReference(item.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="versions" className="mt-0">
                    <div className="flex justify-end mb-4">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={loadVersions}
                        className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                    <PaneState
                      state={versionsState}
                      hasData={versions.length > 0}
                      emptyLabel="当前没有版本记录。"
                      onRetry={loadVersions}
                    />
                    {!versionsState.loading &&
                    !versionsState.error &&
                    versions.length > 0 ? (
                      <div className="space-y-3">
                        {versions.map((item) => (
                          <RowCard
                            key={item.id}
                            icon={GitMerge}
                            title={item.summary || "无摘要"}
                            subtitle={`${item.change_type} · ${formatTime(item.created_at)}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="artifacts" className="mt-0">
                    <div className="flex justify-between gap-2 mb-4">
                      <Button
                        size="sm"
                        onClick={handleQuickCreateArtifact}
                        className="h-9 rounded-xl shadow-sm bg-white/60 backdrop-blur-sm text-zinc-700 border-zinc-200/60 hover:bg-white/80 border"
                      >
                        <PencilLine className="w-4 h-4 mr-1.5 text-zinc-500" />
                        新建工件占位
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={loadArtifacts}
                        className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                    <PaneState
                      state={artifactsState}
                      hasData={artifacts.length > 0}
                      emptyLabel="当前会话还没有工件。"
                      onRetry={loadArtifacts}
                    />
                    {!artifactsState.loading &&
                    !artifactsState.error &&
                    artifacts.length > 0 ? (
                      <div className="space-y-3">
                        {artifacts.map((item) => (
                          <RowCard
                            key={item.id}
                            icon={FileText}
                            title={`${item.type} · ${item.id.slice(0, 8)}`}
                            subtitle={`session=${item.session_id ?? "-"} · version=${item.based_on_version_id ?? "-"}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="members" className="mt-0">
                    <div className="flex gap-2 mb-4">
                      <Input
                        value={newMemberUserId}
                        onChange={(event) =>
                          setNewMemberUserId(event.target.value)
                        }
                        placeholder="输入 user_id"
                        className="h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddMember}
                        className="h-9 rounded-xl shadow-sm bg-zinc-600 hover:bg-zinc-700"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        新增
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={loadMembers}
                        className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                    <PaneState
                      state={membersState}
                      hasData={members.length > 0}
                      emptyLabel="当前没有成员记录。"
                      onRetry={loadMembers}
                    />
                    {!membersState.loading &&
                    !membersState.error &&
                    members.length > 0 ? (
                      <div className="space-y-3">
                        {members.map((item) => (
                          <RowCard
                            key={item.id}
                            icon={Users}
                            title={item.user_id}
                            subtitle={`${item.role} · ${item.status}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="changes" className="mt-0">
                    <div className="flex justify-end mb-4">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={loadChanges}
                        className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                    <PaneState
                      state={changesState}
                      hasData={changes.length > 0}
                      emptyLabel="候选变更为空，复杂审核流程 Phase 1 先占位。"
                      onRetry={loadChanges}
                    />
                    {!changesState.loading &&
                    !changesState.error &&
                    changes.length > 0 ? (
                      <div className="space-y-3">
                        {changes.map((item) => (
                          <RowCard
                            key={item.id}
                            icon={GitPullRequest}
                            title={item.title}
                            subtitle={`${item.status} · ${formatTime(item.created_at)}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
