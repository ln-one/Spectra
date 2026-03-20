"use client";

import { useCallback, useEffect, useState } from "react";
import { projectSpaceApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/client";
import type {
  Artifact,
  CandidateChange,
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
    if (
      error.status === 404 ||
      error.status === 501 ||
      error.code === "NOT_IMPLEMENTED"
    ) {
      return "后端尚未开放该能力（Phase 1 占位）。";
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
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

  const loadReferences = useCallback(async () => {
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
  }, [projectId]);

  const loadVersions = useCallback(async () => {
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
  }, [projectId]);

  const loadArtifacts = useCallback(async () => {
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
  }, [projectId]);

  const loadMembers = useCallback(async () => {
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
  }, [projectId]);

  const loadChanges = useCallback(async () => {
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
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void Promise.all([
        loadReferences(),
        loadVersions(),
        loadArtifacts(),
        loadMembers(),
        loadChanges(),
      ]);
    });
  }, [
    loadArtifacts,
    loadChanges,
    loadMembers,
    loadReferences,
    loadVersions,
    open,
  ]);

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

  return {
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
  };
}
