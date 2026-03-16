import { sdkClient, unwrap } from "./client";
import type { components, paths } from "./types";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse =
  components["schemas"]["SourceDetailResponse"];
export type WebSearchResponse = components["schemas"]["WebSearchResponse"];
export type RAGIndexResponse =
  paths["/api/v1/rag/index"]["post"]["responses"][200]["content"]["application/json"];

export const ragApi = {
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    const result = await sdkClient.POST("/api/v1/rag/search", {
      body: data,
    });
    return unwrap<RAGSearchResponse>(result);
  },

  async getSourceDetail(
    chunkId: string,
    projectId?: string
  ): Promise<SourceDetailResponse> {
    const params = projectId
      ? ({
          path: { chunk_id: chunkId },
          query: { project_id: projectId },
        } as unknown as { path: { chunk_id: string } })
      : { path: { chunk_id: chunkId } };
    const result = await sdkClient.GET("/api/v1/rag/sources/{chunk_id}", {
      params,
    });
    return unwrap<SourceDetailResponse>(result);
  },

  async indexFile(data: {
    file_id: string;
    chunk_size?: number;
    chunk_overlap?: number;
  }): Promise<RAGIndexResponse> {
    const result = await sdkClient.POST("/api/v1/rag/index", {
      body: data,
    });
    return unwrap<RAGIndexResponse>(result);
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

  async webSearch(params: {
    query: string;
    project_id: string;
    max_results?: number;
    auto_index?: boolean;
  }): Promise<WebSearchResponse> {
    const result = await sdkClient.POST("/api/v1/rag/web-search", {
      params: { query: params },
    });
    return unwrap<WebSearchResponse>(result);
  },
};
