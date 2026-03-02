/**
 * RAG (Retrieval-Augmented Generation) API
 *
 * 基于 OpenAPI 契约的 RAG API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request, ENABLE_MOCK } from "./client";
import type { components } from "../types/api";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse =
  components["schemas"]["SourceDetailResponse"];

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockRAGResults = [];

export const ragApi = {
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        success: true,
        data: {
          results: [],
          total: 0,
        },
        message: "Mock 检索成功",
      };
    }

    return request<RAGSearchResponse>("/rag/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getSourceDetail(chunkId: string): Promise<SourceDetailResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          chunk_id: chunkId,
          content: "Mock content",
          source: {
            chunk_id: chunkId,
            source_type: "document",
            filename: "mock.pdf",
            page_number: 1,
            preview_text: "Mock preview",
          },
          context: {},
          file_info: {
            id: "mock-file-id",
            filename: "mock.pdf",
            file_type: "pdf",
            file_size: 0,
            status: "ready",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        message: "Mock 获取成功",
      };
    }

    return request<SourceDetailResponse>(`/rag/sources/${chunkId}`, {
      method: "GET",
    });
  },

  async findSimilar(data: {
    text: string;
    top_k?: number;
    threshold?: number;
  }): Promise<RAGSearchResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        success: true,
        data: {
          results: [],
          total: 0,
        },
        message: "Mock 相似内容查找成功",
      };
    }

    return request<RAGSearchResponse>("/rag/similar", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
