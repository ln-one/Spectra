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

export interface IndexFileRequest {
  file_id: string;
  chunk_size?: number;
  chunk_overlap?: number;
}

export interface IndexFileResponse {
  success: boolean;
  data?: {
    index_task_id: string;
    status: "pending" | "processing" | "completed" | "failed";
  };
}

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

  /**
   * 索引新文件到知识库
   * @param data 索引请求
   * @returns 索引任务信息
   */
  async indexFile(data: IndexFileRequest): Promise<IndexFileResponse> {
    return request<IndexFileResponse>("/rag/index", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
