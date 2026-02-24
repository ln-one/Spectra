/**
 * RAG (Retrieval-Augmented Generation) API
 *
 * 基于 OpenAPI 契约的 RAG API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request } from "./client";
import type { components } from "../types/api";

export type RAGSearchRequest = components["schemas"]["RAGSearchRequest"];
export type RAGSearchResponse = components["schemas"]["RAGSearchResponse"];
export type SourceDetailResponse =
  components["schemas"]["SourceDetailResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockRAGResults = [
  {
    chunk_id: "chunk-1",
    content:
      "二次函数是指未知数的最高次数为二次的多项式函数。一般式为 y = ax² + bx + c（a≠0）。",
    score: 0.95,
    source: {
      chunk_id: "chunk-1",
      source_type: "document" as const,
      filename: "初中数学教材.pdf",
      page_number: 45,
      preview_text: "二次函数是指未知数的最高次数为二次的多项式函数...",
    },
  },
  {
    chunk_id: "chunk-2",
    content:
      "二次函数的图像是一条抛物线。当 a>0 时，抛物线开口向上；当 a<0 时，抛物线开口向下。",
    score: 0.88,
    source: {
      chunk_id: "chunk-2",
      source_type: "document" as const,
      filename: "初中数学教材.pdf",
      page_number: 48,
      preview_text: "二次函数的图像是一条抛物线...",
    },
  },
  {
    chunk_id: "chunk-3",
    content: "顶点坐标为 (-b/2a, (4ac-b²)/4a)，对称轴为直线 x = -b/2a。",
    score: 0.82,
    source: {
      chunk_id: "chunk-3",
      source_type: "document" as const,
      filename: "教学参考.pdf",
      page_number: 12,
      preview_text: "顶点坐标为...",
    },
  },
  {
    chunk_id: "chunk-4",
    content: "例题：已知二次函数 y = x² - 4x + 3，求其顶点坐标和对称轴。",
    score: 0.75,
    source: {
      chunk_id: "chunk-4",
      source_type: "document" as const,
      filename: "习题集.pdf",
      page_number: 23,
      preview_text: "例题：已知二次函数...",
    },
  },
];

export const ragApi = {
  async search(data: RAGSearchRequest): Promise<RAGSearchResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const topK = data.top_k || 5;
      const results = mockRAGResults.slice(0, topK);
      return {
        success: true,
        data: {
          results,
          total: results.length,
        },
        message: "检索成功",
      };
    }

    return request<RAGSearchResponse>("/rag/search", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getSourceDetail(chunkId: string): Promise<SourceDetailResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const result = mockRAGResults.find((r) => r.chunk_id === chunkId);
      if (!result) {
        throw new Error("来源不存在");
      }
      return {
        success: true,
        data: {
          chunk_id: result.chunk_id,
          content: result.content,
          source: result.source,
          context: {
            previous_chunk: "上一段内容...",
            next_chunk: "下一段内容...",
          },
          file_info: {
            id: "file-1",
            filename: result.source.filename,
            file_type: "pdf",
            file_size: 1024000,
            status: "ready",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        message: "获取成功",
      };
    }

    return request<SourceDetailResponse>(`/rag/sources/${chunkId}`, {
      method: "GET",
    });
  },
};
