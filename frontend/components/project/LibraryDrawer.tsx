"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
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
      <div className="h-44 grid place-items-center text-zinc-500">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="h-44 grid place-items-center">
        <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          <p className="mb-3 leading-relaxed">{state.error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="h-44 grid place-items-center">
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
          {emptyLabel}
        </div>
      </div>
    );
  }

  return null;
}

function RowCard({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-800 break-all">{title}</p>
        {action}
      </div>
      {subtitle ? <p className="mt-1.5 text-xs text-zinc-500">{subtitle}</p> : null}
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
      <SheetContent side="right" className="w-full sm:max-w-[520px] p-0 bg-zinc-50">
        <SheetHeader className="px-5 py-4 border-b border-zinc-200 bg-white">
          <SheetTitle className="text-base font-semibold text-zinc-900">
            Lib 工作区
          </SheetTitle>
          <SheetDescription>
            引用、版本、工件、成员、候选变更。所有读写均遵循 OpenAPI 契约。
          </SheetDescription>
        </SheetHeader>

        <div className="h-[calc(100%-84px)] overflow-hidden px-4 py-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList className="grid grid-cols-5 w-full bg-zinc-100 border border-zinc-200">
              <TabsTrigger value="references" className="text-xs">
                引用
              </TabsTrigger>
              <TabsTrigger value="versions" className="text-xs">
                版本
              </TabsTrigger>
              <TabsTrigger value="artifacts" className="text-xs">
                工件
              </TabsTrigger>
              <TabsTrigger value="members" className="text-xs">
                成员
              </TabsTrigger>
              <TabsTrigger value="changes" className="text-xs">
                变更
              </TabsTrigger>
            </TabsList>

            <TabsContent value="references" className="mt-3 h-[calc(100%-52px)] overflow-auto">
              <div className="flex gap-2 mb-3">
                <Input
                  value={newReferenceTarget}
                  onChange={(event) => setNewReferenceTarget(event.target.value)}
                  placeholder="target_project_id"
                />
                <Button size="sm" onClick={handleAddReference}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新增
                </Button>
                <Button size="icon" variant="outline" onClick={loadReferences}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PaneState
                state={referencesState}
                hasData={references.length > 0}
                emptyLabel="当前没有引用，先添加一个关联库。"
                onRetry={loadReferences}
              />
              {!referencesState.loading && !referencesState.error && references.length > 0 ? (
                <div className="space-y-2">
                  {references.map((item) => (
                    <RowCard
                      key={item.id}
                      title={item.target_project_id}
                      subtitle={`${item.relation_type} · ${item.mode} · ${item.status}`}
                      action={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDeleteReference(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      }
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="versions" className="mt-3 h-[calc(100%-52px)] overflow-auto">
              <div className="flex justify-end mb-3">
                <Button size="icon" variant="outline" onClick={loadVersions}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PaneState
                state={versionsState}
                hasData={versions.length > 0}
                emptyLabel="当前没有版本记录。"
                onRetry={loadVersions}
              />
              {!versionsState.loading && !versionsState.error && versions.length > 0 ? (
                <div className="space-y-2">
                  {versions.map((item) => (
                    <RowCard
                      key={item.id}
                      title={item.summary || "无摘要"}
                      subtitle={`${item.change_type} · ${formatTime(item.created_at)}`}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="artifacts" className="mt-3 h-[calc(100%-52px)] overflow-auto">
              <div className="flex justify-between gap-2 mb-3">
                <Button size="sm" onClick={handleQuickCreateArtifact}>
                  <PencilLine className="w-3.5 h-3.5 mr-1.5" />
                  新建工件占位
                </Button>
                <Button size="icon" variant="outline" onClick={loadArtifacts}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PaneState
                state={artifactsState}
                hasData={artifacts.length > 0}
                emptyLabel="当前会话还没有工件。"
                onRetry={loadArtifacts}
              />
              {!artifactsState.loading && !artifactsState.error && artifacts.length > 0 ? (
                <div className="space-y-2">
                  {artifacts.map((item) => (
                    <RowCard
                      key={item.id}
                      title={`${item.type} · ${item.id.slice(0, 8)}`}
                      subtitle={`session=${item.session_id ?? "-"} · version=${item.based_on_version_id ?? "-"}`}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="members" className="mt-3 h-[calc(100%-52px)] overflow-auto">
              <div className="flex gap-2 mb-3">
                <Input
                  value={newMemberUserId}
                  onChange={(event) => setNewMemberUserId(event.target.value)}
                  placeholder="user_id"
                />
                <Button size="sm" onClick={handleAddMember}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  新增
                </Button>
                <Button size="icon" variant="outline" onClick={loadMembers}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PaneState
                state={membersState}
                hasData={members.length > 0}
                emptyLabel="当前没有成员记录。"
                onRetry={loadMembers}
              />
              {!membersState.loading && !membersState.error && members.length > 0 ? (
                <div className="space-y-2">
                  {members.map((item) => (
                    <RowCard
                      key={item.id}
                      title={item.user_id}
                      subtitle={`${item.role} · ${item.status}`}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="changes" className="mt-3 h-[calc(100%-52px)] overflow-auto">
              <div className="flex justify-end mb-3">
                <Button size="icon" variant="outline" onClick={loadChanges}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <PaneState
                state={changesState}
                hasData={changes.length > 0}
                emptyLabel="候选变更为空，复杂审核流程 Phase 1 先占位。"
                onRetry={loadChanges}
              />
              {!changesState.loading && !changesState.error && changes.length > 0 ? (
                <div className="space-y-2">
                  {changes.map((item) => (
                    <RowCard
                      key={item.id}
                      title={item.title}
                      subtitle={`${item.status} · ${formatTime(item.created_at)}`}
                    />
                  ))}
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
