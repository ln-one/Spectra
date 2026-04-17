import { nowIso } from "./base";
import type {
  ArtifactRecord,
  CandidateChangeRecord,
  ProjectMember,
  ProjectReference,
  ProjectVersion,
} from "./types";

export function createMockReference(projectId: string): ProjectReference {
  return {
    id: "ref_mock_1",
    projectId,
    targetProjectId: "proj_mock_base",
    relationType: "base",
    mode: "follow",
    pinnedVersionId: null,
    priority: 0,
    status: "active",
    createdBy: "mock-user",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function createMockVersion(
  projectId: string,
  index: number
): ProjectVersion {
  return {
    id: `ver_mock_${index}`,
    projectId,
    parentVersionId: index > 1 ? `ver_mock_${index - 1}` : null,
    summary: index === 1 ? "Initial import" : `Version ${index} update`,
    changeType: index === 1 ? "import" : "author-update",
    snapshotData: { index },
    createdBy: "mock-user",
    createdAt: new Date(Date.now() - (3 - index) * 3600_000).toISOString(),
  };
}

export function createMockArtifacts(projectId: string): ArtifactRecord[] {
  return [
    {
      id: "art_mock_ppt",
      projectId,
      sessionId: "sess_mock_active",
      basedOnVersionId: "ver_mock_3",
      ownerUserId: "mock-user",
      type: "pptx",
      visibility: "project-visible",
      storagePath: "https://example.com/mock/courseware.pptx",
      metadata: { output_type: "ppt", status: "completed" },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "art_mock_summary",
      projectId,
      sessionId: "sess_mock_active",
      basedOnVersionId: "ver_mock_3",
      ownerUserId: "mock-user",
      type: "summary",
      visibility: "private",
      metadata: { output_type: "summary", status: "completed" },
      createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    },
  ];
}

export function createMockMember(projectId: string): ProjectMember {
  return {
    id: "member_mock_1",
    projectId,
    userId: "mock-user",
    role: "owner",
    permissions: {
      can_view: true,
      can_reference: true,
      can_collaborate: true,
      can_manage: true,
    },
    status: "active",
    createdAt: nowIso(),
  };
}

export function createMockCandidateChange(
  projectId: string
): CandidateChangeRecord {
  return {
    id: "change_mock_1",
    projectId,
    sessionId: "sess_mock_active",
    baseVersionId: "ver_mock_3",
    title: "Supplemental exercises",
    summary: "Added 2 quiz questions with explanations",
    payload: { source: "mock" },
    status: "pending",
    proposerUserId: "mock-user",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}
