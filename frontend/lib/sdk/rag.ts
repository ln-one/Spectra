import { sdkClient, unwrap } from "./client";
import type { components } from "./types";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse =
  components["schemas"]["SourceDetailResponse"];

export const ragApi = {
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    const result = await sdkClient.POST("/api/v1/rag/search", {
      body: data,
    });
    return unwrap<RAGSearchResponse>(result);
  },

  async getSourceDetail(chunkId: string): Promise<SourceDetailResponse> {
    const result = await sdkClient.GET("/api/v1/rag/sources/{chunk_id}", {
      params: {
        path: { chunk_id: chunkId },
      },
    });
    return unwrap<SourceDetailResponse>(result);
  },

  async indexFile(data: {
    file_id: string;
    chunk_size?: number;
    chunk_overlap?: number;
  }): Promise<{
    success: boolean;
    data: { index_task_id: string; status: string };
  }> {
    const result = await sdkClient.POST("/api/v1/rag/index", {
      body: data,
    });
    return unwrap(result);
  },

  async findSimilar(data: {
    text: string;
    top_k?: number;
    threshold?: number;
  }): Promise<RAGSearchResponse> {
    const result = await sdkClient.POST("/api/v1/rag/similar", {
      body: data,
    });
    return unwrap<RAGSearchResponse>(result);
  },
};
