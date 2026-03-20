import { MOCK_MODE, sdkClient, unwrap } from "./base";
import { createMockArtifacts } from "./mocks";
import type {
  ArtifactCreateRequest,
  ArtifactResponse,
  ArtifactsResponse,
} from "./types";

export async function getArtifacts(
  projectId: string,
  params?: {
    type?: string;
    visibility?: string;
    owner_user_id?: string;
    based_on_version_id?: string;
  }
): Promise<ArtifactsResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: { artifacts: createMockArtifacts(projectId) },
      message: "mock artifacts",
    };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/artifacts",
    {
      params: { path: { project_id: projectId }, query: params },
    }
  );
  return unwrap<ArtifactsResponse>(result);
}

export async function getArtifact(
  projectId: string,
  artifactId: string
): Promise<ArtifactResponse> {
  if (MOCK_MODE) {
    const hit =
      createMockArtifacts(projectId).find((a) => a.id === artifactId) ??
      createMockArtifacts(projectId)[0];
    return {
      success: true,
      data: { artifact: hit },
      message: "mock artifact detail",
    };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/artifacts/{artifact_id}",
    {
      params: { path: { project_id: projectId, artifact_id: artifactId } },
    }
  );
  return unwrap<ArtifactResponse>(result);
}

export async function createArtifact(
  projectId: string,
  data: ArtifactCreateRequest
): Promise<ArtifactResponse> {
  if (MOCK_MODE) {
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
      message: "mock create artifact",
    };
  }
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/artifacts",
    {
      params: { path: { project_id: projectId } },
      body: data,
    }
  );
  return unwrap<ArtifactResponse>(result);
}
