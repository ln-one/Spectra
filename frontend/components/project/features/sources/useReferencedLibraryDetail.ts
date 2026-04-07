"use client";

import { useCallback, useEffect, useState } from "react";
import {
  groupArtifactsByTool,
  type ArtifactHistoryItem,
} from "@/lib/project-space/artifact-history";
import { generateApi, projectSpaceApi, projectsApi } from "@/lib/sdk";
import type { ProjectReference } from "../library/types";
import type { UploadedFile } from "./types";

export interface ReferencedLibrarySession {
  id: string;
  title: string;
  state: string;
  createdAt: string;
}

interface LibraryDetailTarget {
  displayName: string;
  reference: ProjectReference;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeLibrarySessions(
  rawSessions: unknown[]
): ReferencedLibrarySession[] {
  return rawSessions
    .map((raw) => {
      const session = asRecord(raw);
      if (!session) return null;
      const id =
        typeof session.session_id === "string" ? session.session_id : "";
      if (!id) return null;
      const titleRaw = session.display_title;
      const title =
        typeof titleRaw === "string" && titleRaw.trim()
          ? titleRaw.trim()
          : `会话 ${id.slice(-6)}`;
      const state =
        typeof session.state === "string" ? session.state : "UNKNOWN";
      const createdAt =
        typeof session.created_at === "string"
          ? session.created_at
          : new Date().toISOString();
      return { id, title, state, createdAt };
    })
    .filter((item): item is ReferencedLibrarySession => !!item)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function useReferencedLibraryDetail() {
  const [selectedLibrary, setSelectedLibrary] =
    useState<LibraryDetailTarget | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReferencedLibrarySession[]>([]);
  const [historyByTool, setHistoryByTool] = useState<
    Array<[string, ArtifactHistoryItem[]]>
  >([]);
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [sourceFiles, setSourceFiles] = useState<UploadedFile[]>([]);

  const openDetail = useCallback((target: LibraryDetailTarget) => {
    setSelectedLibrary(target);
    setIsOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setIsOpen(false);
  }, []);

  const loadDetail = useCallback(async (target: LibraryDetailTarget) => {
    const targetProjectId = target.reference.target_project_id;
    setLoading(true);
    setError(null);
    try {
      const [
        projectResult,
        sessionsResult,
        artifactsResult,
        referencesResult,
        filesResult,
      ] = await Promise.allSettled([
        projectsApi.getProject(targetProjectId),
        generateApi.listSessions({
          project_id: targetProjectId,
          page: 1,
          limit: 20,
        }),
        projectSpaceApi.getArtifacts(targetProjectId),
        projectSpaceApi.getReferences(targetProjectId),
        projectsApi.getProjectFiles(targetProjectId, { page: 1, limit: 20 }),
      ]);

      const errors: string[] = [];

      if (projectResult.status === "fulfilled") {
        const projectName = projectResult.value.data?.project?.name?.trim();
        if (projectName) {
          setSelectedLibrary((current) => {
            if (!current) return current;
            if (current.reference.target_project_id !== targetProjectId) {
              return current;
            }
            if (current.displayName === projectName) return current;
            return { ...current, displayName: projectName };
          });
        }
      }

      if (sessionsResult.status === "fulfilled") {
        const sessionsRaw = Array.isArray(sessionsResult.value.data?.sessions)
          ? (sessionsResult.value.data?.sessions as unknown[])
          : [];
        setSessions(normalizeLibrarySessions(sessionsRaw));
      } else {
        setSessions([]);
        errors.push("会话列表加载失败");
      }

      if (artifactsResult.status === "fulfilled") {
        const artifacts = artifactsResult.value.data?.artifacts ?? [];
        const grouped = groupArtifactsByTool(artifacts);
        setHistoryByTool(
          Object.entries(grouped).filter(([, items]) => items.length > 0)
        );
      } else {
        setHistoryByTool([]);
        errors.push("生成记录加载失败");
      }

      if (referencesResult.status === "fulfilled") {
        const items = (referencesResult.value.data?.references ?? []).sort(
          (a, b) => {
            if (a.relation_type !== b.relation_type) {
              return a.relation_type === "base" ? -1 : 1;
            }
            return (a.priority ?? 999) - (b.priority ?? 999);
          }
        );
        setReferences(items);
      } else {
        setReferences([]);
        errors.push("引用列表加载失败");
      }

      if (filesResult.status === "fulfilled") {
        setSourceFiles(filesResult.value.data?.files ?? []);
      } else {
        setSourceFiles([]);
        errors.push("文件列表加载失败或无权限");
      }

      setError(errors.length > 0 ? errors.join("；") : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selectedLibrary) return;
    await loadDetail(selectedLibrary);
  }, [loadDetail, selectedLibrary]);

  useEffect(() => {
    if (!isOpen || !selectedLibrary) return;
    void loadDetail(selectedLibrary);
  }, [isOpen, loadDetail, selectedLibrary]);

  return {
    isOpen,
    loading,
    error,
    selectedLibrary,
    sessions,
    historyByTool,
    references,
    sourceFiles,
    openDetail,
    closeDetail,
    refreshDetail,
  };
}
