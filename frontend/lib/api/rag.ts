/**
 * RAG API
 *
 * 基于 OpenAPI 契约的知识库检索 API 封装
 */

import { request } from "./client";
import type { components } from "../types/api";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse = components["schemas"]["SourceDetailResponse"];

export const ragApi = {
  /**
   * 检索知识库
   */
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    return request<RAGSearchResponse>("/rag/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * 查看来源详情
   */
  async getSourceDetail(chunkId: string): Promise<SourceDetailResponse> {
    return request<SourceDetailResponse>(`/rag/sources/${chunkId}`, {
      method: "GET",
    });
  },

  /**
   * 索引新文件到知识库
   */
  async indexFile(data: {
    file_id: string;
    chunk_size?: number;
    chunk_overlap?: number;
  }): Promise<{ success: boolean; data: { index_task_id: string; status: string } }> {
    return request("/rag/index", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * 查找相似内容
   */
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
