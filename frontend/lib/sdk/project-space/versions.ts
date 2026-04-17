import { MOCK_MODE, sdkClient, unwrap } from "./base";
import { createMockVersion } from "./mocks";
import type { ProjectVersionResponse, ProjectVersionsResponse } from "./types";

export async function getVersions(
  projectId: string
): Promise<ProjectVersionsResponse> {
  if (MOCK_MODE) {
    return {
      versions: [
        createMockVersion(projectId, 3),
        createMockVersion(projectId, 2),
        createMockVersion(projectId, 1),
      ],
      currentVersionId: "ver_mock_3",
    };
  }
  const result = await sdkClient.GET("/api/v1/projects/{project_id}/versions", {
    params: { path: { project_id: projectId } },
  });
  return await unwrap<ProjectVersionsResponse>(result);
}

export async function getVersion(
  projectId: string,
  versionId: string
): Promise<ProjectVersionResponse> {
  if (MOCK_MODE) {
    return {
      version: { ...createMockVersion(projectId, 3), id: versionId },
    };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/versions/{version_id}",
    {
      params: { path: { project_id: projectId, version_id: versionId } },
    }
  );
  return await unwrap<ProjectVersionResponse>(result);
}
