/**
 * RAG (Retrieval-Augmented Generation) API
 *
 * 基于 OpenAPI 契约的 RAG API 封装
 */

import { request } from "./client";
import type { components } from "../types/api";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse =
  components["schemas"]["SourceDetailResponse"];

export const ragApi = {
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    return request<RAGSearchResponse>("/rag/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getSourceDetail(chunkId: string): Promise<SourceDetailResponse> {
    return request<SourceDetailResponse>(`/rag/sources/${chunkId}`, {
      method: "GET",
    });
  },

  async findSimilar(data: {
    text: string;
    top_k?: number;
    threshold?: number;
  }): Promise<RAGSearchResponse> {
    return request<RAGSearchResponse>("/rag/similar", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
