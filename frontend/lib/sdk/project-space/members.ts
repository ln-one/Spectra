import { MOCK_MODE, sdkClient, unwrap, withIdempotency } from "./base";
import { createMockMember } from "./mocks";
import type {
  ProjectMemberRequest,
  ProjectMemberResponse,
  ProjectMemberUpdateRequest,
  ProjectMembersResponse,
} from "./types";

export async function getMembers(
  projectId: string
): Promise<ProjectMembersResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: { members: [createMockMember(projectId)] },
      message: "mock members",
    };
  }
  const result = await sdkClient.GET("/api/v1/projects/{project_id}/members", {
    params: { path: { project_id: projectId } },
  });
  return unwrap<ProjectMembersResponse>(result);
}

export async function addMember(
  projectId: string,
  data: ProjectMemberRequest
): Promise<ProjectMemberResponse> {
  if (MOCK_MODE) {
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
          created_at: new Date().toISOString(),
        },
      },
      message: "mock add member",
    };
  }
  const headers = withIdempotency({}, true);
  const result = await sdkClient.POST("/api/v1/projects/{project_id}/members", {
    params: { path: { project_id: projectId } },
    body: data,
    headers,
  });
  return unwrap<ProjectMemberResponse>(result);
}

export async function updateMember(
  projectId: string,
  memberId: string,
  data: ProjectMemberUpdateRequest
): Promise<ProjectMemberResponse> {
  if (MOCK_MODE) {
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
  const headers = withIdempotency({}, true);
  const result = await sdkClient.PATCH(
    "/api/v1/projects/{project_id}/members/{member_id}",
    {
      params: { path: { project_id: projectId, member_id: memberId } },
      body: data,
      headers,
    }
  );
  return unwrap<ProjectMemberResponse>(result);
}
