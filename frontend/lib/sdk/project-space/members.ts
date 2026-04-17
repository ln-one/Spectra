import {
  MOCK_MODE,
  apiFetch,
  sdkClient,
  toApiError,
  unwrap,
  withIdempotency,
} from "./base";
import { createMockMember } from "./mocks";
import type {
  ProjectMemberResponse,
  ProjectMembersResponse,
  SimpleSuccessResponse,
} from "./types";
import type { components } from "@/lib/sdk/types";

type ProjectMemberRequest = components["schemas"]["ProjectMemberRequest"];
type ProjectMemberUpdateRequest =
  components["schemas"]["ProjectMemberUpdateRequest"];

export async function getMembers(
  projectId: string
): Promise<ProjectMembersResponse> {
  if (MOCK_MODE) {
    return { members: [createMockMember(projectId)] };
  }
  const result = await sdkClient.GET("/api/v1/projects/{project_id}/members", {
    params: { path: { project_id: projectId } },
  });
  return await unwrap<ProjectMembersResponse>(result);
}

export async function addMember(
  projectId: string,
  data: ProjectMemberRequest
): Promise<ProjectMemberResponse> {
  if (MOCK_MODE) {
    return {
      member: {
        id: `member_mock_${Date.now()}`,
        projectId,
        userId: data.user_id,
        role: data.role ?? "viewer",
        permissions: data.permissions ?? { can_view: true },
        status: "active",
        createdAt: new Date().toISOString(),
      },
    };
  }
  const headers = withIdempotency({}, true);
  const result = await sdkClient.POST("/api/v1/projects/{project_id}/members", {
    params: { path: { project_id: projectId } },
    body: data,
    headers,
  });
  return await unwrap<ProjectMemberResponse>(result);
}

export async function updateMember(
  projectId: string,
  memberId: string,
  data: ProjectMemberUpdateRequest
): Promise<ProjectMemberResponse> {
  if (MOCK_MODE) {
    return {
      member: {
        ...createMockMember(projectId),
        id: memberId,
        role: data.role ?? "viewer",
        permissions: data.permissions ?? { can_view: true },
      },
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
  return await unwrap<ProjectMemberResponse>(result);
}

export async function deleteMember(
  projectId: string,
  memberId: string
): Promise<SimpleSuccessResponse> {
  if (MOCK_MODE) {
    return { ok: true };
  }
  const response = await apiFetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    let payload: unknown = { message: "删除成员失败" };
    try {
      payload = await response.json();
    } catch {
      // Keep the default payload when the body is not JSON.
    }
    throw toApiError(payload, response.status);
  }
  return (await response.json()) as SimpleSuccessResponse;
}
