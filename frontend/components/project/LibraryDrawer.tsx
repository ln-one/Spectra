"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { projectSpaceApi } from "@/lib/sdk";
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

function formatTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

function StateBlock({
  state,
  empty,
  hasData,
  onRetry,
}: {
  state: TabState;
  empty: string;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (state.loading) {
    return (
      <div className="h-40 flex items-center justify-center text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-2 text-zinc-500">
        <p className="text-sm">{state.error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">
        {empty}
      </div>
    );
  }

  return null;
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
        error: error instanceof Error ? error.message : "加载引用失败",
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
        error: error instanceof Error ? error.message : "加载版本失败",
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
        error: error instanceof Error ? error.message : "加载工件失败",
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
        error: error instanceof Error ? error.message : "加载成员失败",
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
        error: error instanceof Error ? error.message : "加载候选变更失败",
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
      // 交由列表状态提示
    }
  };

  const handleDeleteReference = async (referenceId: string) => {
    try {
      await projectSpaceApi.deleteReference(projectId, referenceId);
      await loadReferences();
    } catch {
      // 交由列表状态提示
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
      // 交由列表状态提示
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
      // 交由列表状态提示
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[460px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">Lib 库编辑</SheetTitle>
          <SheetDescription>
            引用 / 版本 / 工件 / 成员 / 候选变更（遵循 OpenAPI 契约）
          </SheetDescription>
        </SheetHeader>

        <div className="h-[calc(100%-80px)] overflow-hidden px-4 py-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList className="grid grid-cols-5 w-full">
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

            <TabsContent value="references" className="h-[calc(100%-54px)] overflow-auto">
              <div className="flex gap-2 mb-3">
                <Input
                  value={newReferenceTarget}
                  onChange={(e) => setNewReferenceTarget(e.target.value)}
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
              <StateBlock
                state={referencesState}
                empty="暂无引用"
                hasData={references.length > 0}
                onRetry={loadReferences}
              />
              {!referencesState.loading && !referencesState.error && references.length > 0 && (
                <div className="space-y-2">
                  {references.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate pr-2">
                          {item.target_project_id}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDeleteReference(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-zinc-500 mt-1">
                        {item.relation_type} · {item.mode} · {item.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="versions" className="h-[calc(100%-54px)] overflow-auto">
              <div className="flex justify-end mb-3">
                <Button size="icon" variant="outline" onClick={loadVersions}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <StateBlock
                state={versionsState}
                empty="暂无版本"
                hasData={versions.length > 0}
                onRetry={loadVersions}
              />
              {!versionsState.loading && !versionsState.error && versions.length > 0 && (
                <div className="space-y-2">
                  {versions.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 text-xs">
                      <p className="font-medium">{item.summary}</p>
                      <p className="text-zinc-500 mt-1">
                        {item.change_type} · {formatTime(item.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="artifacts" className="h-[calc(100%-54px)] overflow-auto">
              <div className="flex gap-2 mb-3 justify-end">
                <Button size="sm" onClick={handleQuickCreateArtifact}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新建占位工件
                </Button>
                <Button size="icon" variant="outline" onClick={loadArtifacts}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <StateBlock
                state={artifactsState}
                empty="暂无工件"
                hasData={artifacts.length > 0}
                onRetry={loadArtifacts}
              />
              {!artifactsState.loading && !artifactsState.error && artifacts.length > 0 && (
                <div className="space-y-2">
                  {artifacts.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 text-xs">
                      <p className="font-medium">
                        {item.type} · {item.id}
                      </p>
                      <p className="text-zinc-500 mt-1">
                        session={item.session_id ?? "-"} · version=
                        {item.based_on_version_id ?? "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="members" className="h-[calc(100%-54px)] overflow-auto">
              <div className="flex gap-2 mb-3">
                <Input
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                  placeholder="user_id"
                />
                <Button size="sm" onClick={handleAddMember}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新增
                </Button>
                <Button size="icon" variant="outline" onClick={loadMembers}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <StateBlock
                state={membersState}
                empty="暂无成员"
                hasData={members.length > 0}
                onRetry={loadMembers}
              />
              {!membersState.loading && !membersState.error && members.length > 0 && (
                <div className="space-y-2">
                  {members.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 text-xs">
                      <p className="font-medium">{item.user_id}</p>
                      <p className="text-zinc-500 mt-1">
                        {item.role} · {item.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="changes" className="h-[calc(100%-54px)] overflow-auto">
              <div className="flex justify-end mb-3">
                <Button size="icon" variant="outline" onClick={loadChanges}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <StateBlock
                state={changesState}
                empty="暂无候选变更"
                hasData={changes.length > 0}
                onRetry={loadChanges}
              />
              {!changesState.loading && !changesState.error && changes.length > 0 && (
                <div className="space-y-2">
                  {changes.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 text-xs">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-zinc-500 mt-1">
                        {item.status} · {formatTime(item.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

