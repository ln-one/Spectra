import { MOCK_MODE, sdkClient, unwrap } from "./base";
import { createMockCandidateChange } from "./mocks";
import type {
  CandidateChangeRequest,
  CandidateChangeResponse,
  CandidateChangeReviewRequest,
  CandidateChangesResponse,
} from "./types";

export async function getCandidateChanges(
  projectId: string,
  params?: {
    status?: string;
    proposer_user_id?: string;
    session_id?: string;
  }
): Promise<CandidateChangesResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: { changes: [createMockCandidateChange(projectId)] },
      message: "mock candidate changes",
    };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/candidate-changes",
    {
      params: { path: { project_id: projectId }, query: params },
    }
  );
  return unwrap<CandidateChangesResponse>(result);
}

export async function createCandidateChange(
  projectId: string,
  data: CandidateChangeRequest
): Promise<CandidateChangeResponse> {
  if (MOCK_MODE) {
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
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/candidate-changes",
    {
      params: { path: { project_id: projectId } },
      body: data,
    }
  );
  return unwrap<CandidateChangeResponse>(result);
}

export async function reviewCandidateChange(
  projectId: string,
  changeId: string,
  data: CandidateChangeReviewRequest
): Promise<CandidateChangeResponse> {
  if (MOCK_MODE) {
    return {
      success: true,
      data: {
        change: {
          ...createMockCandidateChange(projectId),
          id: changeId,
          status: data.action === "accept" ? "accepted" : "rejected",
          updated_at: new Date().toISOString(),
        },
      },
      message: "mock review candidate change",
    };
  }
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/candidate-changes/{change_id}/review",
    {
      params: { path: { project_id: projectId, change_id: changeId } },
      body: data,
    }
  );
  return unwrap<CandidateChangeResponse>(result);
}
