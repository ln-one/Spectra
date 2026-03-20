import { MOCK_MODE, sdkClient, unwrap } from "./base";
import { createMockVersion } from "./mocks";
import type { ProjectVersionResponse, ProjectVersionsResponse } from "./types";

export async function getVersions(
  projectId: string
): Promise<ProjectVersionsResponse> {
  if (MOCK_MODE) {
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
  const result = await sdkClient.GET("/api/v1/projects/{project_id}/versions", {
    params: { path: { project_id: projectId } },
  });
  return unwrap<ProjectVersionsResponse>(result);
}

export async function getVersion(
  projectId: string,
  versionId: string
): Promise<ProjectVersionResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: {
        version: { ...createMockVersion(projectId, 3), id: versionId },
      },
      message: "mock version detail",
    };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/versions/{version_id}",
    {
      params: { path: { project_id: projectId, version_id: versionId } },
    }
  );
  return unwrap<ProjectVersionResponse>(result);
}
