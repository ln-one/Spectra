import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileText, FileUp } from "lucide-react";
import { SourcesPanelView } from "./SourcesPanelView";
import type { SourceItemViewModel } from "./types";

const meta = {
  component: SourcesPanelView,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root h-[812px] bg-[var(--workspace-bg-base)] p-2"
      data-workspace-theme="mist-zinc"
    >
      <SourcesPanelView {...args} />
    </div>
  ),
} satisfies Meta<typeof SourcesPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

const readySource: SourceItemViewModel = {
  Icon: FileText,
  canDelete: true,
  canOpen: false,
  id: "source-ready",
  iconTone: "pdf",
  kind: "file",
  name: "机器学习课程资料.pdf",
  selected: false,
  status: "已建立索引 · 24 个片段",
  statusTone: "success",
};

const uploadingSource: SourceItemViewModel = {
  Icon: FileUp,
  canDelete: true,
  canOpen: false,
  id: "source-uploading",
  iconTone: "text",
  kind: "file",
  name: "课堂补充说明.md",
  selected: false,
  status: "正在上传 · 62%",
  statusTone: "active",
  uploadProgress: 62,
};

const retryableSource: SourceItemViewModel = {
  Icon: FileUp,
  canDelete: true,
  canOpen: false,
  canRetryUpload: true,
  id: "source-retry",
  iconTone: "presentation",
  kind: "file",
  name: "监督学习课件.pptx",
  selected: false,
  status: "上传失败，请重试",
  statusTone: "error",
};

const baseArgs = {
  importControl: <button type="button">导入资料</button>,
  onDismissUploadError: () => undefined,
  onRequestDelete: () => undefined,
  onRequestRetryUpload: () => undefined,
  sources: [readySource, uploadingSource],
  summary: "2 项资料",
  title: "资料来源",
};

export const ReadyAndUploading: Story = { args: baseArgs };

export const UploadFailed: Story = {
  args: {
    ...baseArgs,
    sources: [readySource, retryableSource],
    summary: "1 项需要处理",
    uploadError: "文件上传中断，请检查网络后重试。",
  },
};
