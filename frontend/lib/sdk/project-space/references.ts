import { MOCK_MODE, sdkClient, unwrap, withIdempotency } from "./base";
import { createMockReference } from "./mocks";
import type {
  ProjectReferenceRequest,
  ProjectReferenceResponse,
  ProjectReferenceUpdateRequest,
  ProjectReferencesResponse,
  SimpleSuccessResponse,
} from "./types";

export async function getReferences(
  projectId: string
): Promise<ProjectReferencesResponse> {
  if (MOCK_MODE) {
    return { references: [createMockReference(projectId)] };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/references",
    {
      params: { path: { project_id: projectId } },
    }
  );
  return await unwrap<ProjectReferencesResponse>(result);
}

export async function createReference(
  projectId: string,
  data: ProjectReferenceRequest
): Promise<ProjectReferenceResponse> {
  if (MOCK_MODE) {
    return {
      reference: {
        ...createMockReference(projectId),
        id: `ref_mock_${Date.now()}`,
        targetProjectId: data.target_project_id,
        relationType: data.relation_type,
        mode: data.mode,
        pinnedVersionId: data.pinned_version_id ?? null,
        priority: data.priority ?? 0,
      },
    };
  }
  const headers = withIdempotency({}, true);
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/references",
    {
      params: { path: { project_id: projectId } },
      body: data as never,
      headers,
    }
  );
  return await unwrap<ProjectReferenceResponse>(result);
}

export async function updateReference(
  projectId: string,
  referenceId: string,
  data: ProjectReferenceUpdateRequest
): Promise<ProjectReferenceResponse> {
  if (MOCK_MODE) {
    return {
      reference: {
        ...createMockReference(projectId),
        id: referenceId,
        mode: data.mode ?? "follow",
        pinnedVersionId: data.pinned_version_id ?? null,
        priority: data.priority ?? 0,
        status: data.status ?? "active",
      },
    };
  }
  const result = await sdkClient.PATCH(
    "/api/v1/projects/{project_id}/references/{reference_id}",
    {
      params: {
        path: { project_id: projectId, reference_id: referenceId },
      },
      body: data as never,
    }
  );
  return await unwrap<ProjectReferenceResponse>(result);
}

export async function deleteReference(
  projectId: string,
  referenceId: string
): Promise<SimpleSuccessResponse> {
  if (MOCK_MODE) {
    return { ok: true };
  }
  await sdkClient.DELETE(
    "/api/v1/projects/{project_id}/references/{reference_id}",
    {
      params: {
        path: { project_id: projectId, reference_id: referenceId },
      },
    }
  );
  return { ok: true };
}
