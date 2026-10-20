import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChatPanelView } from "./ChatPanelView";

const conversationId = "00000000-0000-4000-8000-000000000021";
const workspaceId = "00000000-0000-4000-8000-000000000022";

const meta = {
  component: ChatPanelView,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root h-[812px] bg-[var(--workspace-bg-base)] p-2"
      data-workspace-theme="mist-zinc"
    >
      <ChatPanelView {...args} />
    </div>
  ),
} satisfies Meta<typeof ChatPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  conversationId,
  messages: [],
  selectedSourceCount: 0,
  subtitle: "机器学习",
  title: "新对话",
  workspaceId,
};

export const EmptyConversation: Story = { args: baseArgs };

export const CreationToolSelected: Story = {
  args: {
    ...baseArgs,
    onClearCreationTool: () => undefined,
    selectedCreationTool: "smart-slides",
  },
};

export const SentMindMapRequest: Story = {
  args: {
    ...baseArgs,
    messages: [
      {
        id: "user-mind-map-story",
        metadata: {
          spectraSurfaceContext: { kind: "mind_map", type: "artifact_start" },
        },
        parts: [{ text: "梳理机器学习基础", type: "text" }],
        role: "user",
      },
    ],
  },
};

export const WithConversation: Story = {
  args: {
    ...baseArgs,
    messages: [
      {
        id: "user-story",
        parts: [{ text: "请根据资料梳理监督学习的核心概念。", type: "text" }],
        role: "user",
      },
      {
        id: "assistant-story",
        parts: [{ text: "我会先整理概念关系，再给出适合课堂使用的结构。", type: "text" }],
        role: "assistant",
      },
    ],
    selectedSourceCount: 3,
  },
};
