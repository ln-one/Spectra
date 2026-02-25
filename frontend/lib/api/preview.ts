/**
 * Preview API
 *
 * 基于 OpenAPI 契约的预览 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request } from "./client";
import type { components } from "../types/api";

export type PreviewResponse = components["schemas"]["PreviewResponse"];
export type ModifyRequest = components["schemas"]["ModifyRequest"];
export type ModifyResponse = components["schemas"]["ModifyResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockSlides = [
  {
    id: "slide-1",
    index: 1,
    title: "二次函数",
    content:
      "# 二次函数\n\n## 学习目标\n- 理解二次函数的定义\n- 掌握二次函数的图像特征",
    sources: [],
  },
  {
    id: "slide-2",
    index: 2,
    title: "二次函数的定义",
    content:
      "## 二次函数的定义\n\n形如 $y = ax^2 + bx + c$（$a \\neq 0$）的函数叫做二次函数。\n\n其中：\n- $a$ 称为二次项系数\n- $b$ 称为一次项系数\n- $c$ 称为常数项",
    sources: [
      {
        chunk_id: "chunk-1",
        source_type: "document" as const,
        filename: "教材.pdf",
        page_number: 45,
        preview_text: "二次函数的定义...",
      },
    ],
  },
  {
    id: "slide-3",
    index: 3,
    title: "二次函数的图像",
    content:
      "## 二次函数的图像\n\n二次函数的图像是一条抛物线。\n\n**开口方向**：\n- 当 $a > 0$ 时，开口向上\n- 当 $a < 0$ 时，开口向下",
    sources: [],
  },
  {
    id: "slide-4",
    index: 4,
    title: "二次函数的性质",
    content:
      "## 二次函数的性质\n\n1. **顶点**：$(-\\frac{b}{2a}, \\frac{4ac-b^2}{4a})$\n2. **对称轴**：$x = -\\frac{b}{2a}$\n3. **最值**：\n   - $a > 0$ 时，有最小值\n   - $a < 0$ 时，有最大值",
    sources: [],
  },
];

const mockLessonPlan = {
  teaching_objectives: [
    "理解二次函数的定义",
    "掌握二次函数的图像特征",
    "能够判断二次函数的开口方向",
  ],
  slides_plan: [
    {
      slide_id: "slide-1",
      teaching_goal: "导入课题，激发兴趣",
      teacher_script: "同学们，我们今天来学习一个新的函数...",
      suggested_duration: 3,
    },
    {
      slide_id: "slide-2",
      teaching_goal: "理解二次函数的定义",
      teacher_script: "请同学们看这个式子...",
      suggested_duration: 8,
    },
  ],
};

export const previewApi = {
  async getPreview(taskId: string): Promise<PreviewResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          task_id: taskId,
          slides: mockSlides,
          lesson_plan: mockLessonPlan,
        },
        message: "获取成功",
      };
    }

    return request<PreviewResponse>(`/preview/${taskId}`, {
      method: "GET",
    });
  },

  async modifyPreview(
    taskId: string,
    data: ModifyRequest
  ): Promise<ModifyResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const modifyTaskId = `modify-${Date.now()}`;
      return {
        success: true,
        data: {
          modify_task_id: modifyTaskId,
          status: "processing",
        },
        message: "修改任务已创建",
      };
    }

    return request<ModifyResponse>(`/preview/${taskId}/modify`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  },
};
