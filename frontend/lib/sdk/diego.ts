import { API_BASE_URL, apiFetch, toApiError } from "./client";

export interface RegenerateSlideRequest {
  instruction: string;
  preserve_style?: boolean;
}

export const diegoApi = {
  async regenerateSlide(
    runId: string,
    slideNo: number,
    data: RegenerateSlideRequest
  ): Promise<any> {
    const url = `${API_BASE_URL}/api/v1/ppt/runs/${encodeURIComponent(runId)}/slides/${slideNo}/regenerate`;
    const response = await apiFetch(url, {
      method: "POST",
      body: JSON.stringify({
        ...data,
        preserve_style: data.preserve_style ?? true,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    const payload = await response.json();
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload;
  },
};
