import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import { ArtifactResultCard } from "./ArtifactResultCard";

const artifactId = "00000000-0000-4000-8000-000000000099";
const base: ArtifactHistoryItem = {
  createdAt: "2026-10-18T10:00:00.000Z",
  currentRevisionId: null,
  generationState: "queued",
  id: artifactId,
  kind: "presentation",
  title: "机器学习课程课件",
  updatedAt: "2026-10-18T10:00:00.000Z",
};

const meta = {
  component: ArtifactResultCard,
  args: {
    artifactId,
    conversationId: "00000000-0000-4000-8000-000000000008",
    fallbackKind: "presentation",
    fallbackState: "queued",
    fallbackTitle: base.title,
    onRetryArtifact: async () => undefined,
  },
  render: (args) => (
    <div
      className="workspace-theme-root w-full max-w-[375px] bg-[var(--workspace-bg-base)] p-4"
      data-workspace-theme="mist-zinc"
    >
      <ArtifactResultCard {...args} />
    </div>
  ),
} satisfies Meta<typeof ArtifactResultCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = { args: { artifactHistory: [base] } };
export const Generating: Story = {
  args: { artifactHistory: [{ ...base, generationState: "generating" }] },
};
export const Finalizing: Story = {
  args: { artifactHistory: [{ ...base, generationState: "finalizing" }] },
};
export const Ready: Story = { args: { artifactHistory: [{ ...base, generationState: "ready" }] } };
export const ReadyTeachingDocument: Story = {
  args: {
    artifactHistory: [
      { ...base, generationState: "ready", kind: "teaching_document", title: "分布式系统教学文档" },
    ],
  },
};
export const ReadyAnimation: Story = {
  args: {
    artifactHistory: [
      { ...base, generationState: "ready", kind: "animation", title: "二分查找演示动画" },
    ],
  },
};
export const ReadyMindMap: Story = {
  args: {
    artifactHistory: [
      { ...base, generationState: "ready", kind: "mind_map", title: "课程知识导图" },
    ],
  },
};
export const RetryableFailure: Story = {
  args: {
    artifactHistory: [
      {
        ...base,
        canRetryGeneration: true,
        failureCode: "presentation_generation_timeout",
        generationState: "failed",
      },
    ],
  },
};
export const NonRetryableFailure: Story = {
  args: {
    artifactHistory: [
      {
        ...base,
        canRetryGeneration: false,
        failureCode: "unknown",
        generationState: "failed",
        kind: "teaching_document",
      },
    ],
  },
};
export const Cancelled: Story = {
  args: { artifactHistory: [{ ...base, generationState: "cancelled" }] },
};
export const LongTitle: Story = {
  args: {
    artifactHistory: [
      {
        ...base,
        title:
          "A very long course title about the foundations and practical applications of machine learning in the classroom",
      },
    ],
  },
};
export const LongChineseTitle: Story = {
  args: {
    artifactHistory: [
      { ...base, title: "面向课堂教学的机器学习基础原理、方法与实际应用案例综合课程内容整理" },
    ],
  },
};
export const StatusTemporarilyUnavailable: Story = {
  args: { artifactHistory: [base], historyUnavailable: true },
};
export const Unavailable: Story = {
  args: { artifactHistory: [base], unavailableArtifactIds: new Set([artifactId]) },
};
