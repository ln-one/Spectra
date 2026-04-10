import { MOCK_MODE, sdkClient, unwrap } from "./base";
import { createMockCandidateChange } from "./mocks";
import type {
  CandidateChangeResponse,
  CandidateChangesResponse,
} from "./types";
import type { components } from "@/lib/sdk/types";

type CandidateChangeRequest = components["schemas"]["CandidateChangeRequest"];
type CandidateChangeReviewRequest =
  components["schemas"]["CandidateChangeReviewRequest"];

export async function getCandidateChanges(
  projectId: string,
  params?: {
    status?: string;
    proposer_user_id?: string;
    session_id?: string;
  }
): Promise<CandidateChangesResponse> {
  if (MOCK_MODE) {
    return { changes: [createMockCandidateChange(projectId)] };
  }
  const result = await sdkClient.GET(
    "/api/v1/projects/{project_id}/candidate-changes",
    {
      params: { path: { project_id: projectId }, query: params },
    }
  );
  return await unwrap<CandidateChangesResponse>(result);
}

export async function createCandidateChange(
  projectId: string,
  data: CandidateChangeRequest
): Promise<CandidateChangeResponse> {
  if (MOCK_MODE) {
    return {
      change: {
        ...createMockCandidateChange(projectId),
        id: `change_mock_${Date.now()}`,
        title: data.title,
        summary: data.summary ?? "",
        payload: data.payload ?? {},
      },
    };
  }
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/candidate-changes",
    {
      params: { path: { project_id: projectId } },
      body: data,
    }
  );
  return await unwrap<CandidateChangeResponse>(result);
}

export async function reviewCandidateChange(
  projectId: string,
  changeId: string,
  data: CandidateChangeReviewRequest
): Promise<CandidateChangeResponse> {
  if (MOCK_MODE) {
    return {
      change: {
        ...createMockCandidateChange(projectId),
        id: changeId,
        status: data.action === "accept" ? "accepted" : "rejected",
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const result = await sdkClient.POST(
    "/api/v1/projects/{project_id}/candidate-changes/{change_id}/review",
    {
      params: { path: { project_id: projectId, change_id: changeId } },
      body: data,
    }
  );
  return await unwrap<CandidateChangeResponse>(result);
}
