"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { projectSpaceApi } from "@/lib/sdk";
import type { components } from "@/lib/sdk/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type ProjectReference = components["schemas"]["ProjectReference"];
type ProjectVersion = components["schemas"]["ProjectVersion"];
type Artifact = components["schemas"]["Artifact"];
type ProjectMember = components["schemas"]["ProjectMember"];
type CandidateChange = components["schemas"]["CandidateChange"];

interface LibraryWorkspaceProps {
  projectId: string;
}

export function LibraryWorkspace({ projectId }: LibraryWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [changes, setChanges] = useState<CandidateChange[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ProjectVersion | null>(
    null
  );

  const [newReferenceTarget, setNewReferenceTarget] = useState("");
  const [newArtifactType, setNewArtifactType] = useState<
    "mindmap" | "summary" | "exercise" | "html" | "gif" | "mp4"
  >("summary");
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "owner" | "editor" | "viewer"
  >("viewer");

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [refRes, verRes, artRes, memberRes, changeRes] = await Promise.all([
        projectSpaceApi.getReferences(projectId),
        projectSpaceApi.getVersions(projectId),
        projectSpaceApi.getArtifacts(projectId),
        projectSpaceApi.getMembers(projectId),
        projectSpaceApi.getCandidateChanges(projectId),
      ]);
      startTransition(() => {
        setReferences(refRes.data.references ?? []);
        setVersions(verRes.data.versions ?? []);
        setArtifacts(artRes.data.artifacts ?? []);
        setMembers(memberRes.data.members ?? []);
        setChanges(changeRes.data.changes ?? []);
        setSelectedVersion(null);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "加载失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [projectId]);

  const sortedVersions = useMemo(() => {
    return [...versions].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [versions]);

  const handleAddReference = async () => {
    if (!newReferenceTarget.trim()) return;
    const response = await projectSpaceApi.createReference(projectId, {
      target_project_id: newReferenceTarget.trim(),
      relation_type: "auxiliary",
      mode: "follow",
      priority: references.length + 1,
    });
    setReferences((prev) => [response.data.reference, ...prev]);
    setNewReferenceTarget("");
  };

  const handleDeleteReference = async (referenceId: string) => {
    await projectSpaceApi.deleteReference(projectId, referenceId);
    setReferences((prev) => prev.filter((item) => item.id !== referenceId));
  };

  const handleAddArtifact = async () => {
    const response = await projectSpaceApi.createArtifact(projectId, {
      type: newArtifactType,
      visibility: "private",
      mode: "create",
    });
    setArtifacts((prev) => [response.data.artifact, ...prev]);
  };

  const handleAddMember = async () => {
    if (!newMemberUserId.trim()) return;
    const response = await projectSpaceApi.addMember(projectId, {
      user_id: newMemberUserId.trim(),
      role: newMemberRole,
      permissions: {
        can_view: true,
        can_reference: newMemberRole !== "viewer",
        can_collaborate: newMemberRole !== "viewer",
        can_manage: newMemberRole === "owner",
      },
    });
    setMembers((prev) => [response.data.member, ...prev]);
    setNewMemberUserId("");
    setNewMemberRole("viewer");
  };

  const handlePromoteMember = async (member: ProjectMember) => {
    const nextRole = member.role === "viewer" ? "editor" : "viewer";
    const response = await projectSpaceApi.updateMember(projectId, member.id, {
      role: nextRole,
      permissions: {
        ...member.permissions,
        can_reference: nextRole !== "viewer",
        can_collaborate: nextRole !== "viewer",
      },
    });
    setMembers((prev) =>
      prev.map((item) => (item.id === member.id ? response.data.member : item))
    );
  };

  const handleVersionDetail = async (versionId: string) => {
    const response = await projectSpaceApi.getVersion(projectId, versionId);
    setSelectedVersion(response.data.version);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="h-12 border-b px-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800">库模型工作区</p>
          <p className="text-[11px] text-zinc-500">
            引用 / 版本 / 工件 / 成员（契约优先 + Mock 联调）
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={loadAll}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="p-4 text-sm text-red-600">{error}</div>
      ) : (
        <ScrollArea className="h-[calc(100%-48px)]">
          <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">引用管理</CardTitle>
                <CardDescription>references 列表 / 新增 / 删除</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newReferenceTarget}
                    onChange={(e) => setNewReferenceTarget(e.target.value)}
                    placeholder="target_project_id"
                  />
                  <Button onClick={handleAddReference}>
                    <Plus className="w-4 h-4 mr-1" />
                    新增
                  </Button>
                </div>
                {references.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无引用</p>
                ) : (
                  references.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-2"
                    >
                      <div className="text-xs">
                        <p className="font-medium">{item.target_project_id}</p>
                        <p className="text-zinc-500">
                          {item.relation_type} / {item.mode} / {item.status}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteReference(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">版本列表</CardTitle>
                <CardDescription>versions 列表 / 详情查看</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedVersions.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无版本</p>
                ) : (
                  sortedVersions.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left rounded-lg border p-2 hover:bg-zinc-50"
                      onClick={() => handleVersionDetail(item.id)}
                    >
                      <p className="text-xs font-medium">{item.summary}</p>
                      <p className="text-[11px] text-zinc-500">
                        {item.change_type} ·{" "}
                        {new Date(item.created_at).toLocaleString("zh-CN")}
                      </p>
                    </button>
                  ))
                )}
                {selectedVersion && (
                  <div className="rounded-lg border bg-zinc-50 p-2 text-[11px] text-zinc-700">
                    当前详情：{selectedVersion.id} / {selectedVersion.summary}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">工件列表</CardTitle>
                <CardDescription>artifacts 列表 / 轻量创建</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <select
                    className="h-9 rounded-md border px-2 text-sm"
                    value={newArtifactType}
                    onChange={(e) =>
                      setNewArtifactType(
                        e.target.value as
                          | "mindmap"
                          | "summary"
                          | "exercise"
                          | "html"
                          | "gif"
                          | "mp4"
                      )
                    }
                  >
                    <option value="summary">summary</option>
                    <option value="mindmap">mindmap</option>
                    <option value="exercise">exercise</option>
                    <option value="html">html</option>
                    <option value="gif">gif</option>
                    <option value="mp4">mp4</option>
                  </select>
                  <Button onClick={handleAddArtifact}>
                    <Plus className="w-4 h-4 mr-1" />
                    创建
                  </Button>
                </div>
                {artifacts.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无工件</p>
                ) : (
                  artifacts.map((item) => (
                    <div key={item.id} className="rounded-lg border p-2 text-xs">
                      <p className="font-medium">
                        {item.type} · {item.id}
                      </p>
                      <p className="text-zinc-500">
                        {item.visibility} / {item.session_id ?? "no-session"}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">成员管理</CardTitle>
                <CardDescription>members 列表 / 新增 / 基础角色切换</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newMemberUserId}
                    onChange={(e) => setNewMemberUserId(e.target.value)}
                    placeholder="user_id"
                  />
                  <select
                    className="h-9 rounded-md border px-2 text-sm"
                    value={newMemberRole}
                    onChange={(e) =>
                      setNewMemberRole(
                        e.target.value as "owner" | "editor" | "viewer"
                      )
                    }
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="owner">owner</option>
                  </select>
                  <Button onClick={handleAddMember}>新增</Button>
                </div>
                {members.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无成员</p>
                ) : (
                  members.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border p-2 text-xs flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{item.user_id}</p>
                        <p className="text-zinc-500">
                          {item.role} / {item.status}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePromoteMember(item)}
                      >
                        切换角色
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">候选变更（占位）</CardTitle>
                <CardDescription>
                  candidate-changes 已接入列表，复杂审核流 UI 下一阶段再展开
                </CardDescription>
              </CardHeader>
              <CardContent>
                {changes.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无候选变更</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {changes.map((change) => (
                      <div key={change.id} className="rounded-lg border p-2 text-xs">
                        <p className="font-medium">{change.title}</p>
                        <p className="text-zinc-500">
                          {change.status} / {change.proposer_user_id}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

