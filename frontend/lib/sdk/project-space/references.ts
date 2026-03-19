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
    return {
      success: true,
      data: { references: [createMockReference(projectId)] },
      message: "mock references",
    };
  }
  const result = await sdkClient.GET("/api/v1/projects/{project_id}/references", {
    params: { path: { project_id: projectId } },
  });
  return unwrap<ProjectReferencesResponse>(result);
}

export async function createReference(
  projectId: string,
  data: ProjectReferenceRequest
): Promise<ProjectReferenceResponse> {
  if (MOCK_MODE) {
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
  const headers = withIdempotency({}, true);
  const result = await sdkClient.POST("/api/v1/projects/{project_id}/references", {
    params: { path: { project_id: projectId } },
    body: data,
    headers,
  });
  return unwrap<ProjectReferenceResponse>(result);
}

export async function updateReference(
  projectId: string,
  referenceId: string,
  data: ProjectReferenceUpdateRequest
): Promise<ProjectReferenceResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: {
        reference: {
          ...createMockReference(projectId),
          id: referenceId,
          ...data,
        },
      },
      message: "mock update reference",
    };
  }
  const result = await sdkClient.PATCH(
    "/api/v1/projects/{project_id}/references/{reference_id}",
    {
      params: {
        path: { project_id: projectId, reference_id: referenceId },
      },
      body: data,
    }
  );
  return unwrap<ProjectReferenceResponse>(result);
}

export async function deleteReference(
  projectId: string,
  referenceId: string
): Promise<SimpleSuccessResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: {},
      message: "mock delete reference",
    };
  }
  const result = await sdkClient.DELETE(
    "/api/v1/projects/{project_id}/references/{reference_id}",
    {
      params: {
        path: { project_id: projectId, reference_id: referenceId },
      },
    }
  );
  return unwrap<SimpleSuccessResponse>(result);
}
