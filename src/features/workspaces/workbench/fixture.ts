import { FilePenLine, FileText, Image, Network, Presentation } from "lucide-react";
import { WorkspaceSourceIcon } from "@/components/icons/WorkspaceSourceIcon";
import { STUDIO_TOOL_IDS } from "./studioTools";
import type { WorkbenchVisualFixture } from "./types";

export const workbenchVisualFixture: WorkbenchVisualFixture = {
  id: "spectra-biology-core",
  disclaimer: "Spectra 输出内容可能存在偏差，请在课堂使用前进行复核。",
  workspace: {
    workspaceName: "高中生物细胞结构与功能",
    threadTitle: "细胞结构课件生成",
  },
  studio: {
    title: "备课工坊",
    subtitle: "AI 生成工具",
    tools: STUDIO_TOOL_IDS,
  },
  chat: {
    title: "智能助手",
    subtitle: "AI 助手对话",
    messages: [
      {
        id: "assistant-intro",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "我已经读取了教材节选、实验记录和板书草图。左侧 Studio 卡片可以直接生成课件、讲义、思维导图和课堂互动。",
          },
        ],
        metadata: { custom: { timestamp: "12:00" } },
      },
      {
        id: "user-request",
        role: "user",
        parts: [{ type: "text", text: "先帮我围绕细胞膜、细胞核和线粒体做一版 12 页课件。" }],
        metadata: { custom: { timestamp: "12:00" } },
      },
      {
        id: "assistant-unavailable",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "已准备好课件生成配置。当前是 workbench design fixture，真实生成能力显示为显式 unavailable。",
          },
        ],
        metadata: { custom: { timestamp: "12:00" } },
      },
    ],
    selectedSourceCount: 1,
  },
  sources: {
    title: "资料来源",
    summary: "4 个文件 · 1 个资料库 · 2 已选",
    sources: [
      {
        id: "workspace-library",
        name: "proj_mock_base",
        status: "含 3 份资料",
        Icon: WorkspaceSourceIcon,
        kind: "workspace",
        typeLabel: "知识空间",
        iconTone: "workspace",
        selected: true,
        canOpen: false,
        canDelete: false,
      },
      {
        id: "slides-artifact",
        name: "细胞结构思维导图",
        status: "思维导图 · 更新于 07-13",
        Icon: Network,
        kind: "artifact",
        artifactKind: "mind_map",
        artifactTone: "teal",
        selected: false,
        canOpen: true,
        canDelete: true,
      },
      {
        id: "document-artifact",
        name: "细胞结构课堂讲义",
        status: "教学文档 · 更新于 07-13",
        Icon: FileText,
        kind: "artifact",
        artifactKind: "teaching_document",
        artifactTone: "blue",
        selected: false,
        canOpen: true,
        canDelete: true,
      },
      {
        id: "textbook-source",
        name: "细胞结构教材节选.pdf",
        status: "上传完成，待索引",
        Icon: FileText,
        kind: "file",
        iconTone: "pdf",
        selected: false,
        canOpen: false,
        canDelete: true,
      },
      {
        id: "experiment-source",
        name: "显微镜观察实验记录.docx",
        status: "上传完成，待索引",
        Icon: FilePenLine,
        kind: "file",
        iconTone: "document",
        selected: false,
        canOpen: false,
        canDelete: true,
      },
      {
        id: "presentation-source",
        name: "细胞结构课堂演示.pptx",
        status: "上传完成，待索引",
        Icon: Presentation,
        kind: "file",
        iconTone: "presentation",
        selected: false,
        canOpen: false,
        canDelete: true,
      },
      {
        id: "blackboard-source",
        name: "课堂板书草图.png",
        status: "上传完成，待索引",
        Icon: Image,
        kind: "file",
        iconTone: "image",
        selected: false,
        canOpen: false,
        canDelete: true,
      },
    ],
  },
};
