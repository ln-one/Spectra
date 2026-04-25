import { MOCK_MODE, apiFetch, sdkClient, toApiError, unwrap } from "./base";
import { createMockArtifacts } from "./mocks";
import type { ArtifactResponse, ArtifactsResponse } from "./types";
import type { components } from "@/lib/sdk/types";

type ArtifactCreateRequest = components["schemas"]["ArtifactCreateRequest"];

export async function getArtifacts(
  projectId: string,
  params?: {
    type?: string;
    visibility?: string;
    owner_user_id?: string;
    based_on_version_id?: string;
    session_id?: string;
  }
): Promise<ArtifactsResponse> {
  if (MOCK_MODE) {
    return { artifacts: createMockArtifacts(projectId) };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/artifacts",
    {
      params: { path: { project_id: projectId }, query: params },
      cache: "no-store",
    }
  );
  return await unwrap<ArtifactsResponse>(result);
}

export async function getArtifact(
  projectId: string,
  artifactId: string
): Promise<ArtifactResponse> {
  if (MOCK_MODE) {
    const hit =
      createMockArtifacts(projectId).find((a) => a.id === artifactId) ??
      createMockArtifacts(projectId)[0];
    return { artifact: hit };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/artifacts/{artifact_id}",
    {
      params: { path: { project_id: projectId, artifact_id: artifactId } },
      cache: "no-store",
    }
  );
  return await unwrap<ArtifactResponse>(result);
}

export async function createArtifact(
  projectId: string,
  data: ArtifactCreateRequest
): Promise<ArtifactResponse> {
  if (MOCK_MODE) {
    return {
      artifact: {
        id: `art_mock_${Date.now()}`,
        projectId,
        sessionId: data.session_id ?? null,
        basedOnVersionId: data.based_on_version_id ?? null,
        ownerUserId: "mock-user",
        type: data.type,
        visibility: data.visibility ?? "private",
        storagePath: undefined,
        metadata: {
          mode: data.mode ?? "create",
          status: "completed",
          output_type: data.type,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/artifacts",
    {
      params: { path: { project_id: projectId } },
      body: data,
    }
  );
  return await unwrap<ArtifactResponse>(result);
}

export async function downloadArtifact(
  projectId: string,
  artifactId: string
): Promise<Blob> {
  if (MOCK_MODE) {
    return new Blob(
      [JSON.stringify({ project_id: projectId, artifact_id: artifactId })],
      { type: "application/json;charset=utf-8" }
    );
  }
  const response = await apiFetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/download?ts=${encodeURIComponent(Date.now().toString())}`,
    {
      cache: "no-store",
    }
  );
  if (!response.ok) {
    let payload: unknown = { message: "下载工件失败" };
    try {
      payload = await response.json();
    } catch {
      // Keep the default payload when the body is not JSON.
    }
    throw toApiError(payload, response.status);
  }
  return response.blob();
}
