/**
 * Health API
 *
 * 基于 OpenAPI 契约的健康检查 API 封装
 */

import { request } from "./client";

export interface HealthCapabilitiesResponse {
  success: boolean;
  data: {
    capabilities: {
      document_parser: { status: string; provider: string };
      video_understanding: { status: string; provider: string };
      speech_recognition: { status: string; provider: string };
    };
  };
  message: string;
}

export const healthApi = {
  /**
   * 获取服务端能力状态
   */
  async getCapabilities(): Promise<HealthCapabilitiesResponse> {
    return request<HealthCapabilitiesResponse>("/health/capabilities", {
      method: "GET",
    });
  },
};
