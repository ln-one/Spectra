import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorkspaceHeaderView } from "./WorkspaceHeaderView";

const conversationId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000003";

const meta = {
  component: WorkspaceHeaderView,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root min-h-screen bg-[var(--workspace-bg-base)]"
      data-workspace-theme="mist-zinc"
    >
      <WorkspaceHeaderView {...args} />
    </div>
  ),
} satisfies Meta<typeof WorkspaceHeaderView>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  accountMenu: <button type="button">账户</button>,
  conversationId,
  conversations: [
    {
      conversationId,
      title: "折射实验课程设计",
      updatedAt: "2026-10-13T09:00:00.000Z",
    },
  ],
  deleteThreadAction: async () => null,
  newConversationId: "00000000-0000-4000-8000-000000000002",
  renameThreadAction: async () => null,
  settingsAction: async () => null,
  settingsControl: <button type="button">设置</button>,
  threadTitle: "折射实验课程设计",
  workspaceId,
  workspaceHref: `/workspaces/${workspaceId}`,
  workspaceName: "机器学习",
  workspaceSlug: "machine-learning",
  workspaces: [
    {
      href: `/workspaces/${workspaceId}`,
      id: workspaceId,
      name: "机器学习",
      ownerHandle: "teacher",
      updatedAt: "2026-10-13T09:00:00.000Z",
    },
  ],
};

export const ExistingConversation: Story = { args: baseArgs };

export const NewConversation: Story = {
  args: {
    ...baseArgs,
    conversationId: "00000000-0000-4000-8000-000000000004",
    threadTitle: "新对话",
  },
};
