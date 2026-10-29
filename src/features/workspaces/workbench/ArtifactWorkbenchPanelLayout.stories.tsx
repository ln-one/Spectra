import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ArtifactWorkbenchPanelLayout } from "./ArtifactWorkbenchPanelLayout";

const meta = {
  component: ArtifactWorkbenchPanelLayout,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root h-dvh bg-[var(--workspace-bg-base)]"
      data-workspace-theme="mist-zinc"
    >
      <ArtifactWorkbenchPanelLayout {...args} />
    </div>
  ),
} satisfies Meta<typeof ArtifactWorkbenchPanelLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

function MobilePreviewFrame({
  children,
  subtitle,
  title,
  tone,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
  tone: "blue" | "green" | "orange" | "teal";
}) {
  return (
    <section
      className="workspace-panel-card h-full overflow-y-auto rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)]"
      data-studio-tone={tone}
    >
      <header className="flex min-h-[58px] items-center gap-3 border-b border-[var(--workspace-border)] px-4">
        <button
          aria-label="返回对话"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--workspace-border)] text-[var(--workspace-text-muted)]"
          type="button"
        >
          ←
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <p className="text-[11px] text-[var(--workspace-text-muted)]">{subtitle}</p>
        </div>
      </header>
      <div className="min-h-[calc(100%-58px)] p-5">{children}</div>
    </section>
  );
}

export const DocumentPreview: Story = {
  args: {
    artifact: (
      <MobilePreviewFrame subtitle="已完成 · 可导出" title="机器学习基础教学文档" tone="blue">
        <h1 className="text-2xl font-semibold">机器学习基础教学文档</h1>
        <p className="mt-5 leading-8">引言：什么是机器学习？</p>
        <p className="mt-3 leading-8">在手机上打开成果卡片时，正文占据可读的单列宽度。</p>
      </MobilePreviewFrame>
    ),
    assistant: <div>对话</div>,
    disclaimer: "",
    layoutMode: "preview",
    sources: <div>资料</div>,
  },
};

export const PresentationPreview: Story = {
  args: {
    artifact: (
      <MobilePreviewFrame subtitle="已完成 · 第 2 / 8 页" title="机器学习课程课件" tone="orange">
        <div className="flex aspect-[16/10] flex-col justify-between rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-5">
          <p className="text-xs font-medium text-[var(--studio-accent-text)]">核心概念</p>
          <h1 className="text-2xl font-semibold tracking-tight">监督学习：从样本中归纳规律</h1>
          <div className="flex items-center justify-between text-xs text-[var(--workspace-text-muted)]">
            <span>‹ 上一页</span>
            <span>下一页 ›</span>
          </div>
        </div>
      </MobilePreviewFrame>
    ),
    assistant: <div>对话</div>,
    disclaimer: "",
    layoutMode: "preview",
    sources: <div>资料</div>,
  },
};

export const MindMapPreview: Story = {
  args: {
    artifact: (
      <MobilePreviewFrame subtitle="已完成 · 双指缩放查看" title="课程知识导图" tone="teal">
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-4">
          <div className="grid gap-3 text-center text-sm font-medium text-[var(--studio-accent-text)]">
            <span className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-4 py-2">
              机器学习
            </span>
            <div className="grid grid-cols-2 gap-5 text-xs">
              <span>监督学习</span>
              <span>无监督学习</span>
            </div>
          </div>
        </div>
      </MobilePreviewFrame>
    ),
    assistant: <div>对话</div>,
    disclaimer: "",
    layoutMode: "preview",
    sources: <div>资料</div>,
  },
};

export const AnimationPreview: Story = {
  args: {
    artifact: (
      <MobilePreviewFrame subtitle="已完成 · 00:30" title="二分查找演示动画" tone="green">
        <div className="flex aspect-video items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)]">
          <button
            aria-label="播放动画"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)]"
            type="button"
          >
            ▶
          </button>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-[var(--workspace-border)]">
          <div className="h-full w-1/3 rounded-full bg-[var(--studio-emphasis)]" />
        </div>
      </MobilePreviewFrame>
    ),
    assistant: <div>对话</div>,
    disclaimer: "",
    layoutMode: "preview",
    sources: <div>资料</div>,
  },
};
