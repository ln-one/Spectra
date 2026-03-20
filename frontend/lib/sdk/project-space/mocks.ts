import type { components } from "../types";
import { nowIso } from "./base";

export function createMockReference(
  projectId: string
): components["schemas"]["ProjectReference"] {
  return {
    id: "ref_mock_1",
    project_id: projectId,
    target_project_id: "proj_mock_base",
    relation_type: "base",
    mode: "follow",
    pinned_version_id: null,
    priority: 0,
    status: "active",
    created_by: "mock-user",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function createMockVersion(
  projectId: string,
  index: number
): components["schemas"]["ProjectVersion"] {
  return {
    id: `ver_mock_${index}`,
    project_id: projectId,
    parent_version_id: index > 1 ? `ver_mock_${index - 1}` : null,
    summary: index === 1 ? "Initial import" : `Version ${index} update`,
    change_type: index === 1 ? "import" : "author-update",
    snapshot_data: { index },
    created_by: "mock-user",
    created_at: new Date(Date.now() - (3 - index) * 3600_000).toISOString(),
  };
}

export function createMockArtifacts(
  projectId: string
): components["schemas"]["Artifact"][] {
  return [
    {
      id: "art_mock_ppt",
      project_id: projectId,
      session_id: "sess_mock_active",
      based_on_version_id: "ver_mock_3",
      owner_user_id: "mock-user",
      type: "pptx",
      visibility: "project-visible",
      storage_path: "https://example.com/mock/courseware.pptx",
      metadata: { output_type: "ppt", status: "completed" },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "art_mock_summary",
      project_id: projectId,
      session_id: "sess_mock_active",
      based_on_version_id: "ver_mock_3",
      owner_user_id: "mock-user",
      type: "summary",
      visibility: "private",
      metadata: { output_type: "summary", status: "completed" },
      created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    },
  ];
}

export function createMockMember(
  projectId: string
): components["schemas"]["ProjectMember"] {
  return {
    id: "member_mock_1",
    project_id: projectId,
    user_id: "mock-user",
    role: "owner",
    permissions: {
      can_view: true,
      can_reference: true,
      can_collaborate: true,
      can_manage: true,
    },
    status: "active",
    created_at: nowIso(),
  };
}

export function createMockCandidateChange(
  projectId: string
): components["schemas"]["CandidateChange"] {
  return {
    id: "change_mock_1",
    project_id: projectId,
    session_id: "sess_mock_active",
    base_version_id: "ver_mock_3",
    title: "Supplemental exercises",
    summary: "Added 2 quiz questions with explanations",
    payload: { source: "mock" },
    status: "pending",
    proposer_user_id: "mock-user",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}
