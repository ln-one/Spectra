"use client";

import { useCallback, useEffect, useState } from "react";
import { projectSpaceApi, projectsApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/client";
import {
  buildArtifactDownloadFilename,
  inferArtifactDownloadExt,
  resolveArtifactTitleFromMetadata,
} from "@/lib/project-space/download-filename";
import type {
  AvailableLibraryProject,
  Artifact,
  CandidateChange,
  CurrentLibrarySettings,
  ProjectMember,
  ProjectReference,
  ProjectVersion,
} from "./types";
import type { TabState } from "./shared";

function formatLibraryError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.code === "FORBIDDEN") {
      return "权限不足：当前账号无法访问该能力。";
    }
    if (error.status === 409 || error.code === "CONFLICT") {
      return `状态冲突：${error.message}`;
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeLibraryProject(raw: unknown): AvailableLibraryProject | null {
  const project = asRecord(raw);
  if (!project) return null;

  const id = typeof project.id === "string" ? project.id : "";
  if (!id) return null;

  const name =
    typeof project.name === "string" && project.name.trim() ? project.name : id;
  const description =
    typeof project.description === "string" ? project.description : "";
  const status = typeof project.status === "string" ? project.status : "draft";
  const visibilityRaw = project.visibility;
  const visibility =
    visibilityRaw === "shared" || visibilityRaw === "private"
      ? visibilityRaw
      : "unknown";
  const isReferenceableRaw =
    project.is_referenceable ?? project.isReferenceable;
  const isReferenceable = isReferenceableRaw === true;
  const currentVersionIdRaw =
    project.current_version_id ?? project.currentVersionId;
  const currentVersionId =
    typeof currentVersionIdRaw === "string" && currentVersionIdRaw.trim()
      ? currentVersionIdRaw
      : null;

  return {
    id,
    name,
    description,
    status,
    visibility,
    isReferenceable,
    currentVersionId,
  };
}

function normalizeCurrentLibrarySettings(
  raw: unknown
): CurrentLibrarySettings | null {
  const project = asRecord(raw);
  if (!project) return null;

  const id = typeof project.id === "string" ? project.id : "";
  if (!id) return null;

  const name =
    typeof project.name === "string" && project.name.trim() ? project.name : id;
  const description =
    typeof project.description === "string" ? project.description : "";
  const gradeLevelRaw = project.grade_level ?? project.gradeLevel;
  const gradeLevel =
    typeof gradeLevelRaw === "string" && gradeLevelRaw.trim()
      ? gradeLevelRaw
      : null;
  const visibilityRaw = project.visibility;
  const visibility: "private" | "shared" =
    visibilityRaw === "shared" ? "shared" : "private";
  const isReferenceableRaw =
    project.is_referenceable ?? project.isReferenceable;
  const isReferenceable = isReferenceableRaw === true;

  return {
    id,
    name,
    description,
    gradeLevel,
    visibility,
    isReferenceable,
  };
}

function parsePriority(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 10;
}

function enrichReferenceLabels(
  references: ProjectReference[],
  libraries: AvailableLibraryProject[]
): ProjectReference[] {
  const nameById = new Map(
    libraries.map((library) => [library.id, library.name])
  );
  return references.map((reference) => {
    const targetId = reference.targetProjectId;
    const targetName =
      reference.targetProjectName ??
      (targetId ? (nameById.get(targetId) ?? null) : null);
    return targetName
      ? { ...reference, targetProjectName: targetName }
      : reference;
  });
}

export function useLibraryDrawerData(projectId: string, open: boolean) {
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
  const [librariesState, setLibrariesState] = useState<TabState>({
    loading: false,
    error: null,
  });
  const [currentLibraryState, setCurrentLibraryState] = useState<TabState>({
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
  const [newReferenceRelationType, setNewReferenceRelationType] = useState<
    "base" | "auxiliary"
  >("auxiliary");
  const [newReferenceMode, setNewReferenceMode] = useState<"follow" | "pinned">(
    "follow"
  );
  const [newReferencePinnedVersion, setNewReferencePinnedVersion] =
    useState("");
  const [newReferencePriority, setNewReferencePriority] = useState("10");

  const [newArtifactType, setNewArtifactType] = useState<
    "mindmap" | "summary" | "exercise" | "html" | "gif" | "mp4"
  >("summary");
  const [newArtifactVisibility, setNewArtifactVisibility] = useState<
    "private" | "project-visible" | "shared"
  >("private");
  const [newArtifactMode, setNewArtifactMode] = useState<"create" | "replace">(
    "create"
  );
  const [newArtifactSessionId, setNewArtifactSessionId] = useState("");
  const [newArtifactBasedVersionId, setNewArtifactBasedVersionId] =
    useState("");

  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "owner" | "editor" | "viewer"
  >("viewer");

  const [newChangeTitle, setNewChangeTitle] = useState("");
  const [newChangeSummary, setNewChangeSummary] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [availableLibraries, setAvailableLibraries] = useState<
    AvailableLibraryProject[]
  >([]);
  const [currentLibrarySettings, setCurrentLibrarySettings] =
    useState<CurrentLibrarySettings | null>(null);
  const [currentLibrarySaving, setCurrentLibrarySaving] = useState(false);
  const [currentLibraryNameDraft, setCurrentLibraryNameDraft] = useState("");
  const [currentLibraryDescriptionDraft, setCurrentLibraryDescriptionDraft] =
    useState("");
  const [currentLibraryGradeLevelDraft, setCurrentLibraryGradeLevelDraft] =
    useState("");
  const [currentLibraryVisibilityDraft, setCurrentLibraryVisibilityDraft] =
    useState<"private" | "shared">("private");
  const [
    currentLibraryReferenceableDraft,
    setCurrentLibraryReferenceableDraft,
  ] = useState(false);

  const loadReferences = useCallback(async () => {
    setReferencesState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getReferences(projectId);
      setReferences(response.references ?? []);
      setReferencesState({ loading: false, error: null });
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "加载引用失败"),
      });
    }
  }, [projectId]);

  const loadAvailableLibraries = useCallback(async () => {
    setLibrariesState({ loading: true, error: null });
    try {
      const response = await projectsApi.getProjects({ page: 1, limit: 100 });
      const normalized = (response.data.projects ?? [])
        .map((project) => normalizeLibraryProject(project))
        .filter((project): project is AvailableLibraryProject => !!project)
        .filter((project) => project.id !== projectId)
        .sort((a, b) => {
          if (a.isReferenceable !== b.isReferenceable) {
            return a.isReferenceable ? -1 : 1;
          }
          if (a.visibility !== b.visibility) {
            return a.visibility === "shared" ? -1 : 1;
          }
          return a.name.localeCompare(b.name, "zh-CN");
        });
      setAvailableLibraries(normalized);
      setLibrariesState({ loading: false, error: null });
    } catch (error) {
      setLibrariesState({
        loading: false,
        error: formatLibraryError(error, "加载库列表失败"),
      });
    }
  }, [projectId]);

  useEffect(() => {
    setReferences((current) =>
      enrichReferenceLabels(current, availableLibraries)
    );
  }, [availableLibraries]);

  const loadCurrentLibrarySettings = useCallback(async () => {
    setCurrentLibraryState({ loading: true, error: null });
    try {
      const response = await projectsApi.getProject(projectId);
      const normalized = normalizeCurrentLibrarySettings(response.data.project);
      if (!normalized) {
        setCurrentLibrarySettings(null);
        setCurrentLibraryState({
          loading: false,
          error: "当前库信息异常，无法读取设置",
        });
        return;
      }
      setCurrentLibrarySettings(normalized);
      setCurrentLibraryNameDraft(normalized.name);
      setCurrentLibraryDescriptionDraft(normalized.description);
      setCurrentLibraryGradeLevelDraft(normalized.gradeLevel ?? "");
      setCurrentLibraryVisibilityDraft(normalized.visibility);
      setCurrentLibraryReferenceableDraft(normalized.isReferenceable);
      setCurrentLibraryState({ loading: false, error: null });
    } catch (error) {
      setCurrentLibrarySettings(null);
      setCurrentLibraryState({
        loading: false,
        error: formatLibraryError(error, "加载当前库设置失败"),
      });
    }
  }, [projectId]);

  const resetCurrentLibraryDrafts = useCallback(() => {
    if (!currentLibrarySettings) return;
    setCurrentLibraryNameDraft(currentLibrarySettings.name);
    setCurrentLibraryDescriptionDraft(currentLibrarySettings.description);
    setCurrentLibraryGradeLevelDraft(currentLibrarySettings.gradeLevel ?? "");
    setCurrentLibraryVisibilityDraft(currentLibrarySettings.visibility);
    setCurrentLibraryReferenceableDraft(currentLibrarySettings.isReferenceable);
    setCurrentLibraryState((previous) => ({
      ...previous,
      error: null,
    }));
  }, [currentLibrarySettings]);

  const loadVersions = useCallback(async () => {
    setVersionsState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getVersions(projectId);
      setVersions(response.versions ?? []);
      setVersionsState({ loading: false, error: null });
    } catch (error) {
      setVersionsState({
        loading: false,
        error: formatLibraryError(error, "加载版本失败"),
      });
    }
  }, [projectId]);

  const loadArtifacts = useCallback(async () => {
    setArtifactsState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getArtifacts(projectId);
      setArtifacts(response.artifacts ?? []);
      setArtifactsState({ loading: false, error: null });
    } catch (error) {
      setArtifactsState({
        loading: false,
        error: formatLibraryError(error, "加载工件失败"),
      });
    }
  }, [projectId]);

  const loadMembers = useCallback(async () => {
    setMembersState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getMembers(projectId);
      setMembers(response.members ?? []);
      setMembersState({ loading: false, error: null });
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "加载成员失败"),
      });
    }
  }, [projectId]);

  const loadChanges = useCallback(async () => {
    setChangesState({ loading: true, error: null });
    try {
      const response = await projectSpaceApi.getCandidateChanges(projectId);
      setChanges(response.changes ?? []);
      setChangesState({ loading: false, error: null });
    } catch (error) {
      setChangesState({
        loading: false,
        error: formatLibraryError(error, "加载候选变更失败"),
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void Promise.all([
        loadReferences(),
        loadAvailableLibraries(),
        loadCurrentLibrarySettings(),
      ]);
    });
  }, [
    loadAvailableLibraries,
    loadCurrentLibrarySettings,
    loadReferences,
    open,
  ]);

  const handleSaveCurrentLibrarySettings = async () => {
    if (!currentLibrarySettings) return;
    const nextName = currentLibraryNameDraft.trim();
    if (!nextName) {
      setCurrentLibraryState({
        loading: false,
        error: "库名称不能为空，请先填写名称再保存。",
      });
      return;
    }
    const nextDescription = currentLibraryDescriptionDraft.trim() || nextName;
    const nextGradeLevel = currentLibraryGradeLevelDraft.trim() || undefined;
    if (
      currentLibraryVisibilityDraft === "private" &&
      currentLibraryReferenceableDraft
    ) {
      setCurrentLibraryState({
        loading: false,
        error: "私有库不能设置为可引用，请先改为共享。",
      });
      return;
    }
    setCurrentLibrarySaving(true);
    setCurrentLibraryState({ loading: false, error: null });
    try {
      const response = await projectsApi.updateProject(projectId, {
        name: nextName,
        description: nextDescription,
        grade_level: nextGradeLevel,
        visibility: currentLibraryVisibilityDraft,
        is_referenceable: currentLibraryReferenceableDraft,
      });
      const normalized = normalizeCurrentLibrarySettings(response.data.project);
      if (!normalized) {
        setCurrentLibraryState({
          loading: false,
          error: "保存成功，但返回数据异常。",
        });
        return;
      }
      setCurrentLibrarySettings(normalized);
      setCurrentLibraryNameDraft(normalized.name);
      setCurrentLibraryDescriptionDraft(normalized.description);
      setCurrentLibraryGradeLevelDraft(normalized.gradeLevel ?? "");
      setCurrentLibraryVisibilityDraft(normalized.visibility);
      setCurrentLibraryReferenceableDraft(normalized.isReferenceable);
      setCurrentLibraryState({ loading: false, error: null });
    } catch (error) {
      setCurrentLibraryState({
        loading: false,
        error: formatLibraryError(error, "保存当前库设置失败"),
      });
    } finally {
      setCurrentLibrarySaving(false);
    }
  };

  const createReferenceByTarget = useCallback(
    async (
      targetProjectId: string,
      options?: { pinnedVersionId?: string | null }
    ) => {
      const normalizedTargetId = targetProjectId.trim();
      if (!normalizedTargetId) return;
      const pinnedVersionId = options?.pinnedVersionId || null;
      await projectSpaceApi.createReference(projectId, {
        target_project_id: normalizedTargetId,
        relation_type: newReferenceRelationType,
        mode: newReferenceMode,
        pinned_version_id:
          newReferenceMode === "pinned"
            ? pinnedVersionId || newReferencePinnedVersion.trim() || null
            : null,
        priority: parsePriority(newReferencePriority),
      });
    },
    [
      newReferenceMode,
      newReferencePinnedVersion,
      newReferencePriority,
      newReferenceRelationType,
      projectId,
    ]
  );

  const handleAddReference = async () => {
    const targetId = newReferenceTarget.trim();
    if (!targetId) return;
    try {
      await createReferenceByTarget(targetId);
      setReferencesState({ loading: false, error: null });
      setNewReferenceTarget("");
      setNewReferencePinnedVersion("");
      await loadReferences();
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "新增引用失败"),
      });
    }
  };

  const handleQuickAddReference = async (
    targetProjectId: string,
    options?: { pinnedVersionId?: string | null }
  ) => {
    try {
      await createReferenceByTarget(targetProjectId, options);
      setReferencesState({ loading: false, error: null });
      setNewReferenceTarget("");
      setNewReferencePinnedVersion("");
      await loadReferences();
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "引入库失败"),
      });
    }
  };

  const handleDeleteReference = async (referenceId: string) => {
    try {
      await projectSpaceApi.deleteReference(projectId, referenceId);
      setReferencesState({ loading: false, error: null });
      await loadReferences();
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "删除引用失败"),
      });
    }
  };

  const handleToggleReferenceStatus = async (
    referenceId: string,
    currentStatus: ProjectReference["status"]
  ) => {
    try {
      await projectSpaceApi.updateReference(projectId, referenceId, {
        status: currentStatus === "active" ? "disabled" : "active",
      });
      setReferencesState({ loading: false, error: null });
      await loadReferences();
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "更新引用状态失败"),
      });
    }
  };

  const handleUpdateReferencePriority = async (
    referenceId: string,
    priority: number
  ) => {
    try {
      await projectSpaceApi.updateReference(projectId, referenceId, {
        priority,
      });
      setReferencesState({ loading: false, error: null });
      await loadReferences();
    } catch (error) {
      setReferencesState({
        loading: false,
        error: formatLibraryError(error, "更新引用优先级失败"),
      });
    }
  };

  const handleCreateArtifact = async () => {
    try {
      await projectSpaceApi.createArtifact(projectId, {
        type: newArtifactType,
        visibility: newArtifactVisibility,
        mode: newArtifactMode,
        session_id: newArtifactSessionId.trim() || null,
        based_on_version_id: newArtifactBasedVersionId.trim() || null,
      });
      setArtifactsState({ loading: false, error: null });
      await loadArtifacts();
    } catch (error) {
      setArtifactsState({
        loading: false,
        error: formatLibraryError(error, "创建工件失败"),
      });
    }
  };

  const handleDownloadArtifact = async (artifactId: string) => {
    const target = artifacts.find((artifact) => artifact.id === artifactId);
    if (!target) {
      setArtifactsState({ loading: false, error: "未找到工件，无法下载" });
      return;
    }
    try {
      const blob = await projectSpaceApi.downloadArtifact(
        projectId,
        artifactId
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildArtifactDownloadFilename({
        title: resolveArtifactTitleFromMetadata(target.metadata),
        artifactId: target.id,
        artifactType: target.type,
        ext: inferArtifactDownloadExt(target.type),
      });
      link.click();
      URL.revokeObjectURL(url);
      setArtifactsState({ loading: false, error: null });
    } catch (error) {
      setArtifactsState({
        loading: false,
        error: formatLibraryError(error, "下载工件失败"),
      });
    }
  };

  const handleAddMember = async () => {
    const userId = newMemberUserId.trim();
    if (!userId) return;
    try {
      await projectSpaceApi.addMember(projectId, {
        user_id: userId,
        role: newMemberRole,
      });
      setMembersState({ loading: false, error: null });
      setNewMemberUserId("");
      await loadMembers();
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "添加成员失败"),
      });
    }
  };

  const handleUpdateMemberRole = async (
    memberId: string,
    role: "owner" | "editor" | "viewer"
  ) => {
    try {
      await projectSpaceApi.updateMember(projectId, memberId, { role });
      setMembersState({ loading: false, error: null });
      await loadMembers();
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "更新成员角色失败"),
      });
    }
  };

  const handleToggleMemberStatus = async (
    memberId: string,
    currentStatus: ProjectMember["status"]
  ) => {
    try {
      await projectSpaceApi.updateMember(projectId, memberId, {
        status: currentStatus === "active" ? "disabled" : "active",
      });
      setMembersState({ loading: false, error: null });
      await loadMembers();
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "更新成员状态失败"),
      });
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      await projectSpaceApi.deleteMember(projectId, memberId);
      setMembersState({ loading: false, error: null });
      await loadMembers();
    } catch (error) {
      setMembersState({
        loading: false,
        error: formatLibraryError(error, "删除成员失败"),
      });
    }
  };

  const handleCreateCandidateChange = async () => {
    const title = newChangeTitle.trim();
    if (!title) return;
    try {
      await projectSpaceApi.createCandidateChange(projectId, {
        title,
        summary: newChangeSummary.trim() || undefined,
      });
      setChangesState({ loading: false, error: null });
      setNewChangeTitle("");
      setNewChangeSummary("");
      await loadChanges();
    } catch (error) {
      setChangesState({
        loading: false,
        error: formatLibraryError(error, "提交候选变更失败"),
      });
    }
  };

  const handleReviewCandidateChange = async (
    changeId: string,
    action: "accept" | "reject"
  ) => {
    try {
      await projectSpaceApi.reviewCandidateChange(projectId, changeId, {
        action,
        review_comment: reviewComment.trim() || undefined,
      });
      setChangesState({ loading: false, error: null });
      await loadChanges();
      await loadVersions();
    } catch (error) {
      setChangesState({
        loading: false,
        error: formatLibraryError(error, "审核候选变更失败"),
      });
    }
  };

  return {
    activeTab,
    setActiveTab,
    references,
    versions,
    artifacts,
    members,
    changes,
    referencesState,
    librariesState,
    currentLibraryState,
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

    loadReferences,
    loadAvailableLibraries,
    loadCurrentLibrarySettings,
    loadVersions,
    loadArtifacts,
    loadMembers,
    loadChanges,

    handleAddReference,
    handleDeleteReference,
    handleToggleReferenceStatus,
    handleUpdateReferencePriority,
    handleQuickAddReference,
    handleSaveCurrentLibrarySettings,

    handleCreateArtifact,
    handleDownloadArtifact,

    handleAddMember,
    handleUpdateMemberRole,
    handleToggleMemberStatus,
    handleDeleteMember,

    handleCreateCandidateChange,
    handleReviewCandidateChange,
  };
}
