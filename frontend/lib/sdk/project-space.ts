import { sdkClient, unwrap, withIdempotency } from "./client";
import type { components } from "./types";

type ProjectReferencesResponse = components["schemas"]["ProjectReferencesResponse"];
type ProjectReferenceRequest = components["schemas"]["ProjectReferenceRequest"];
type ProjectReferenceResponse = components["schemas"]["ProjectReferenceResponse"];
type ProjectReferenceUpdateRequest =
  components["schemas"]["ProjectReferenceUpdateRequest"];
type ProjectVersionsResponse = components["schemas"]["ProjectVersionsResponse"];
type ProjectVersionResponse = components["schemas"]["ProjectVersionResponse"];
type ArtifactsResponse = components["schemas"]["ArtifactsResponse"];
type ArtifactResponse = components["schemas"]["ArtifactResponse"];
type ArtifactCreateRequest = components["schemas"]["ArtifactCreateRequest"];
type ProjectMembersResponse = components["schemas"]["ProjectMembersResponse"];
type ProjectMemberResponse = components["schemas"]["ProjectMemberResponse"];
type ProjectMemberRequest = components["schemas"]["ProjectMemberRequest"];
type ProjectMemberUpdateRequest =
  components["schemas"]["ProjectMemberUpdateRequest"];
type CandidateChangesResponse = components["schemas"]["CandidateChangesResponse"];
type CandidateChangeResponse = components["schemas"]["CandidateChangeResponse"];
type CandidateChangeRequest = components["schemas"]["CandidateChangeRequest"];
type CandidateChangeReviewRequest =
  components["schemas"]["CandidateChangeReviewRequest"];
type SimpleSuccessResponse = components["schemas"]["SimpleSuccessResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

function shouldUseMock(_error?: unknown): boolean {
  return MOCK_MODE;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createMockReference(
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

function createMockVersion(
  projectId: string,
  index: number
): components["schemas"]["ProjectVersion"] {
  return {
    id: `ver_mock_${index}`,
    project_id: projectId,
    parent_version_id: index > 1 ? `ver_mock_${index - 1}` : null,
    summary: index === 1 ? "初始化版本" : `第 ${index} 次正式入库`,
    change_type: index === 1 ? "import" : "author-update",
    snapshot_data: { index },
    created_by: "mock-user",
    created_at: new Date(Date.now() - (3 - index) * 3600_000).toISOString(),
  };
}

function createMockArtifacts(
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

function createMockMember(
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

function createMockCandidateChange(
  projectId: string
): components["schemas"]["CandidateChange"] {
  return {
    id: "change_mock_1",
    project_id: projectId,
    session_id: "sess_mock_active",
    base_version_id: "ver_mock_3",
    title: "补充练习题案例",
    summary: "新增 2 道选择题并补充解析",
    payload: { source: "mock" },
    status: "pending",
    proposer_user_id: "mock-user",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export const projectSpaceApi = {
  async getReferences(projectId: string): Promise<ProjectReferencesResponse> {
    try {
      const result = await sdkClient.GET("/api/v1/projects/{project_id}/references", {
        params: { path: { project_id: projectId } },
      });
      return unwrap<ProjectReferencesResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: { references: [createMockReference(projectId)] },
        message: "mock references",
      };
    }
  },

  async createReference(
    projectId: string,
    data: ProjectReferenceRequest
  ): Promise<ProjectReferenceResponse> {
    const headers = withIdempotency({}, true);
    try {
      const result = await sdkClient.POST(
        "/api/v1/projects/{project_id}/references",
        {
          params: { path: { project_id: projectId } },
          body: data,
          headers,
        }
      );
      return unwrap<ProjectReferenceResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          reference: {
            ...createMockReference(projectId),
            id: `ref_mock_${Date.now()}`,
            target_project_id: data.target_project_id,
            relation_type: data.relation_type,
            mode: data.mode,
            pinned_version_id: data.pinned_version_id ?? null,
            priority: data.priority ?? 0,
          },
        },
        message: "mock create reference",
      };
    }
  },

  async updateReference(
    projectId: string,
    referenceId: string,
    data: ProjectReferenceUpdateRequest
  ): Promise<ProjectReferenceResponse> {
    try {
      const result = await sdkClient.PATCH(
        "/api/v1/projects/{project_id}/references/{reference_id}",
        {
          params: { path: { project_id: projectId, reference_id: referenceId } },
          body: data,
        }
      );
      return unwrap<ProjectReferenceResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          reference: {
            ...createMockReference(projectId),
            id: referenceId,
            ...data,
            updated_at: nowIso(),
          },
        },
        message: "mock update reference",
      };
    }
  },

  async deleteReference(
    projectId: string,
    referenceId: string
  ): Promise<SimpleSuccessResponse> {
    try {
      const result = await sdkClient.DELETE(
        "/api/v1/projects/{project_id}/references/{reference_id}",
        {
          params: { path: { project_id: projectId, reference_id: referenceId } },
        }
      );
      return unwrap<SimpleSuccessResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {},
        message: "mock delete reference",
      };
    }
  },

  async getVersions(projectId: string): Promise<ProjectVersionsResponse> {
    try {
      const result = await sdkClient.GET("/api/v1/projects/{project_id}/versions", {
        params: { path: { project_id: projectId } },
      });
      return unwrap<ProjectVersionsResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          versions: [
            createMockVersion(projectId, 3),
            createMockVersion(projectId, 2),
            createMockVersion(projectId, 1),
          ],
        },
        message: "mock versions",
      };
    }
  },

  async getVersion(
    projectId: string,
    versionId: string
  ): Promise<ProjectVersionResponse> {
    try {
      const result = await sdkClient.GET(
        "/api/v1/projects/{project_id}/versions/{version_id}",
        {
          params: { path: { project_id: projectId, version_id: versionId } },
        }
      );
      return unwrap<ProjectVersionResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          version: { ...createMockVersion(projectId, 3), id: versionId },
        },
        message: "mock version detail",
      };
    }
  },

  async getArtifacts(
    projectId: string,
    params?: {
      type?: string;
      visibility?: string;
      owner_user_id?: string;
      based_on_version_id?: string;
    }
  ): Promise<ArtifactsResponse> {
    try {
      const result = await sdkClient.GET("/api/v1/projects/{project_id}/artifacts", {
        params: { path: { project_id: projectId }, query: params },
      });
      return unwrap<ArtifactsResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: { artifacts: createMockArtifacts(projectId) },
        message: "mock artifacts",
      };
    }
  },

  async getArtifact(
    projectId: string,
    artifactId: string
  ): Promise<ArtifactResponse> {
    try {
      const result = await sdkClient.GET(
        "/api/v1/projects/{project_id}/artifacts/{artifact_id}",
        {
          params: { path: { project_id: projectId, artifact_id: artifactId } },
        }
      );
      return unwrap<ArtifactResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      const hit =
        createMockArtifacts(projectId).find((a) => a.id === artifactId) ??
        createMockArtifacts(projectId)[0];
      return {
        success: true,
        data: { artifact: hit },
        message: "mock artifact detail",
      };
    }
  },

  async createArtifact(
    projectId: string,
    data: ArtifactCreateRequest
  ): Promise<ArtifactResponse> {
    try {
      const result = await sdkClient.POST("/api/v1/projects/{project_id}/artifacts", {
        params: { path: { project_id: projectId } },
        body: data,
      });
      return unwrap<ArtifactResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          artifact: {
            id: `art_mock_${Date.now()}`,
            project_id: projectId,
            session_id: data.session_id ?? null,
            based_on_version_id: data.based_on_version_id ?? null,
            owner_user_id: "mock-user",
            type: data.type,
            visibility: data.visibility ?? "private",
            storage_path: undefined,
            metadata: {
              mode: data.mode ?? "create",
              status: "completed",
              output_type: data.type,
            },
            created_at: nowIso(),
            updated_at: nowIso(),
          },
        },
        message: "mock create artifact",
      };
    }
  },

  async getMembers(projectId: string): Promise<ProjectMembersResponse> {
    try {
      const result = await sdkClient.GET("/api/v1/projects/{project_id}/members", {
        params: { path: { project_id: projectId } },
      });
      return unwrap<ProjectMembersResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: { members: [createMockMember(projectId)] },
        message: "mock members",
      };
    }
  },

  async addMember(
    projectId: string,
    data: ProjectMemberRequest
  ): Promise<ProjectMemberResponse> {
    const headers = withIdempotency({}, true);
    try {
      const result = await sdkClient.POST("/api/v1/projects/{project_id}/members", {
        params: { path: { project_id: projectId } },
        body: data,
        headers,
      });
      return unwrap<ProjectMemberResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          member: {
            id: `member_mock_${Date.now()}`,
            project_id: projectId,
            user_id: data.user_id,
            role: data.role ?? "viewer",
            permissions: data.permissions ?? { can_view: true },
            status: "active",
            created_at: nowIso(),
          },
        },
        message: "mock add member",
      };
    }
  },

  async updateMember(
    projectId: string,
    memberId: string,
    data: ProjectMemberUpdateRequest
  ): Promise<ProjectMemberResponse> {
    const headers = withIdempotency({}, true);
    try {
      const result = await sdkClient.PATCH(
        "/api/v1/projects/{project_id}/members/{member_id}",
        {
          params: { path: { project_id: projectId, member_id: memberId } },
          body: data,
          headers,
        }
      );
      return unwrap<ProjectMemberResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          member: {
            ...createMockMember(projectId),
            id: memberId,
            role: data.role ?? "viewer",
            permissions: data.permissions ?? { can_view: true },
          },
        },
        message: "mock update member",
      };
    }
  },

  async getCandidateChanges(
    projectId: string,
    params?: {
      status?: string;
      proposer_user_id?: string;
      session_id?: string;
    }
  ): Promise<CandidateChangesResponse> {
    try {
      const result = await sdkClient.GET(
        "/api/v1/projects/{project_id}/candidate-changes",
        {
          params: { path: { project_id: projectId }, query: params },
        }
      );
      return unwrap<CandidateChangesResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: { changes: [createMockCandidateChange(projectId)] },
        message: "mock candidate changes",
      };
    }
  },

  async createCandidateChange(
    projectId: string,
    data: CandidateChangeRequest
  ): Promise<CandidateChangeResponse> {
    try {
      const result = await sdkClient.POST(
        "/api/v1/projects/{project_id}/candidate-changes",
        {
          params: { path: { project_id: projectId } },
          body: data,
        }
      );
      return unwrap<CandidateChangeResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          change: {
            ...createMockCandidateChange(projectId),
            id: `change_mock_${Date.now()}`,
            title: data.title,
            summary: data.summary ?? "",
            payload: data.payload ?? {},
          },
        },
        message: "mock create candidate change",
      };
    }
  },

  async reviewCandidateChange(
    projectId: string,
    changeId: string,
    data: CandidateChangeReviewRequest
  ): Promise<CandidateChangeResponse> {
    try {
      const result = await sdkClient.POST(
        "/api/v1/projects/{project_id}/candidate-changes/{change_id}/review",
        {
          params: { path: { project_id: projectId, change_id: changeId } },
          body: data,
        }
      );
      return unwrap<CandidateChangeResponse>(result);
    } catch (error) {
      if (!shouldUseMock(error)) throw error;
      return {
        success: true,
        data: {
          change: {
            ...createMockCandidateChange(projectId),
            id: changeId,
            status: data.action === "accept" ? "accepted" : "rejected",
            updated_at: nowIso(),
          },
        },
        message: "mock review candidate change",
      };
    }
  },
};

