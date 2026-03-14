import { sdkClient, unwrap } from "./client";
import type { components } from "./types";

export type HealthCapabilitiesResponse =
  components["schemas"]["CapabilitiesHealthResponse"];

export const healthApi = {
  async getCapabilities(): Promise<HealthCapabilitiesResponse> {
    const result = await sdkClient.GET("/api/v1/health/capabilities");
    return unwrap<HealthCapabilitiesResponse>(result);
  },
};
