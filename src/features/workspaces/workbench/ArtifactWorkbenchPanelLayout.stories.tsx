import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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

export const DocumentPreview: Story = {
  args: {
    artifact: (
      <section className="workspace-panel-card h-full overflow-y-auto rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-5 text-[var(--workspace-text-primary)]">
        <h1 className="text-2xl font-semibold">机器学习基础教学文档</h1>
        <p className="mt-5 leading-8">引言：什么是机器学习？</p>
        <p className="mt-3 leading-8">在手机上打开成果卡片时，正文占据可读的单列宽度。</p>
      </section>
    ),
    assistant: <div>对话</div>,
    disclaimer: "",
    layoutMode: "preview",
    sources: <div>资料</div>,
  },
};
