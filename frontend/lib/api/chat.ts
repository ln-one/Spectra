/**
 * Chat API
 *
 * 基于 OpenAPI 契约的对话 API 封装
 * 支持 Mock 模式用于前端独立开发
 *
 * 更新日期: 2026-02-25
 * 更新内容: 添加语音输入接口支持
 */

import { request } from "./client";
import type { components } from "../types/api";

export type Message = components["schemas"]["Message"];
export type SendMessageRequest = components["schemas"]["SendMessageRequest"];
export type SendMessageResponse = components["schemas"]["SendMessageResponse"];
export type GetMessagesResponse = components["schemas"]["GetMessagesResponse"];
export type VoiceMessageResponse =
  components["schemas"]["VoiceMessageResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockMessages: Message[] = [
  {
    id: "msg-1",
    role: "user",
    content: "我想创建一个关于二次函数的课件",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "好的，我来帮您创建二次函数的课件。请问您的教学对象是哪个年级？您希望课件包含哪些内容章节？",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1000).toISOString(),
  },
  {
    id: "msg-3",
    role: "user",
    content: "初中三年级学生，章节包括概念、图像性质和应用",
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

export const chatApi = {
  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: data.content,
        timestamp: new Date().toISOString(),
      };
      mockMessages.push(userMessage);

      const suggestions = [
        "继续完善课件内容",
        "添加更多练习题",
        "生成配套教案",
      ];

      const assistantMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        role: "assistant",
        content: getAutoResponse(data.content),
        timestamp: new Date().toISOString(),
      };
      mockMessages.push(assistantMessage);

      return {
        success: true,
        data: {
          message: assistantMessage,
          suggestions,
        },
        message: "发送成功",
      };
    }

    return request<SendMessageResponse>("/chat/messages", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },

  async getMessages(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<GetMessagesResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const page = params?.page || 1;
      const limit = params?.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const messages = mockMessages.slice(start, end);
      return {
        success: true,
        data: {
          messages,
          total: mockMessages.length,
          page,
          limit,
        },
        message: "获取成功",
      };
    }

    const queryParams = new URLSearchParams();
    queryParams.set("project_id", projectId);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));

    return request<GetMessagesResponse>(`/chat/messages?${queryParams}`, {
      method: "GET",
    });
  },

  /**
   * 发送语音消息
   * @param audio 音频文件
   * @param projectId 项目 ID
   * @returns 语音识别结果和消息
   */
  async sendVoiceMessage(
    audio: File,
    projectId: string
  ): Promise<VoiceMessageResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: "这是模拟的语音识别结果：我想创建一个关于函数的课件",
        timestamp: new Date().toISOString(),
      };
      mockMessages.push(userMessage);

      return {
        success: true,
        data: {
          text: "这是模拟的语音识别结果：我想创建一个关于函数的课件",
          confidence: 0.95,
          duration: audio.size / 16000, // 模拟时长
          message: userMessage,
          suggestions: ["继续完善需求", "开始生成课件", "上传参考资料"],
        },
        message: "语音识别成功",
      };
    }

    const formData = new FormData();
    formData.append("audio", audio);
    formData.append("project_id", projectId);

    return request<VoiceMessageResponse>("/chat/voice", {
      method: "POST",
      body: formData,
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },
};

function getAutoResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("二次函数")) {
    return "明白了！二次函数是初中数学的重要内容。我会帮您设计包含以下章节的课件：\n\n1. 二次函数的定义\n2. 二次函数的图像（抛物线）\n3. 二次函数的性质\n4. 二次函数的应用\n\n是否需要我开始生成课件？";
  }

  if (lowerMessage.includes("生成") || lowerMessage.includes("开始")) {
    return "好的，我现在开始为您生成课件内容。请稍候...\n\n（系统提示：您可以先上传一些教学参考资料，这样可以生成更精准的内容）";
  }

  return "明白了，我会根据您的需求来调整课件内容。请问还有其他需要补充的吗？";
}
