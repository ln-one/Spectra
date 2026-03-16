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
  Library,
  GitMerge,
  FileText,
  Users,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { projectSpaceApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/client";
import type { components } from "@/lib/sdk/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
        <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-200/60 bg-white/80 backdrop-blur px-4 py-2 text-[13px] font-medium shadow-sm">
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
        <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-red-50/50 p-5 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3 opacity-80" />
          <p className="mb-4 text-[13px] text-red-800 font-medium leading-relaxed">
            {state.error}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="bg-white hover:bg-red-50 border-red-200 text-red-700 rounded-xl h-8 px-4"
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
          <div className="w-12 h-12 rounded-2xl bg-zinc-100/80 flex items-center justify-center mx-auto mb-3">
            <Library className="w-5 h-5 text-zinc-400" />
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
  icon?: any;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative rounded-2xl border border-zinc-200/60 bg-white/60 hover:bg-white p-3.5 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all duration-300 backdrop-blur-sm"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-white/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="mt-0.5 shrink-0 p-2 rounded-xl bg-zinc-100/80 text-zinc-500 group-hover:text-zinc-900 group-hover:bg-zinc-100 transition-colors">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-zinc-800 break-all leading-snug group-hover:text-zinc-950 transition-colors">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-[11px] font-medium text-zinc-500 tracking-wide">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action && (
          <div className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity mt-0.5">
            {action}
          </div>
        )}
      </div>
    </motion.div>
  );
}

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] p-0 bg-zinc-50/95 backdrop-blur-2xl border-l border-white/40 shadow-2xl"
      >
        <SheetHeader className="px-6 py-5 border-b border-zinc-200/60 bg-white/60 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <SheetTitle className="text-[17px] font-bold text-zinc-900 flex items-center gap-2">
            <span className="p-1.5 bg-zinc-900 text-white rounded-lg shadow-sm">
              <Library className="w-4 h-4" />
            </span>
            Library Workspace
          </SheetTitle>
          <SheetDescription className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed relative z-10">
            涵盖资源关联、版本快照、成果归档及成员协作的高级管理面板。
          </SheetDescription>
        </SheetHeader>

        <div className="h-[calc(100%-100px)] overflow-hidden px-5 py-4">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full"
          >
            <TabsList className="grid grid-cols-5 w-full bg-zinc-200/50 backdrop-blur-md border border-zinc-200/80 rounded-xl p-1 gap-1 h-auto relative z-10">
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

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <TabsContent
                  value="references"
                  className="mt-4 h-[calc(100%-52px)] overflow-auto scrollbar-hide pb-10"
                >
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newReferenceTarget}
                      onChange={(event) =>
                        setNewReferenceTarget(event.target.value)
                      }
                      placeholder="输入 target_project_id"
                      className="rounded-xl border-zinc-200 bg-white/80 focus-visible:ring-emerald-500/20 shadow-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddReference}
                      className="rounded-xl shadow-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      新增
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={loadReferences}
                      className="rounded-xl shadow-sm bg-white/80 hover:bg-white"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
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

                <TabsContent
                  value="versions"
                  className="mt-4 h-[calc(100%-52px)] overflow-auto scrollbar-hide pb-10"
                >
                  <div className="flex justify-end mb-4">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={loadVersions}
                      className="rounded-xl shadow-sm bg-white/80 hover:bg-white"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
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

                <TabsContent
                  value="artifacts"
                  className="mt-4 h-[calc(100%-52px)] overflow-auto scrollbar-hide pb-10"
                >
                  <div className="flex justify-between gap-2 mb-4">
                    <Button
                      size="sm"
                      onClick={handleQuickCreateArtifact}
                      className="rounded-xl shadow-sm bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50 border"
                    >
                      <PencilLine className="w-4 h-4 mr-1.5 text-zinc-500" />
                      新建工件占位
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={loadArtifacts}
                      className="rounded-xl shadow-sm bg-white/80 hover:bg-white"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
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

                <TabsContent
                  value="members"
                  className="mt-4 h-[calc(100%-52px)] overflow-auto scrollbar-hide pb-10"
                >
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newMemberUserId}
                      onChange={(event) =>
                        setNewMemberUserId(event.target.value)
                      }
                      placeholder="输入 user_id"
                      className="rounded-xl border-zinc-200 bg-white/80 focus-visible:ring-emerald-500/20 shadow-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddMember}
                      className="rounded-xl shadow-sm"
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      新增
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={loadMembers}
                      className="rounded-xl shadow-sm bg-white/80 hover:bg-white"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
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

                <TabsContent
                  value="changes"
                  className="mt-4 h-[calc(100%-52px)] overflow-auto scrollbar-hide pb-10"
                >
                  <div className="flex justify-end mb-4">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={loadChanges}
                      className="rounded-xl shadow-sm bg-white/80 hover:bg-white"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-600" />
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
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
