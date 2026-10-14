import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MobileWorkspaceOverview } from "./MobileWorkspaceOverview";

const meta = {
  component: MobileWorkspaceOverview,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root h-screen bg-[var(--workspace-bg-base)]"
      data-workspace-theme="mist-zinc"
    >
      <MobileWorkspaceOverview {...args} />
    </div>
  ),
} satisfies Meta<typeof MobileWorkspaceOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithConversations: Story = {
  args: {
    conversations: [
      {
        conversationId: "00000000-0000-4000-8000-000000000001",
        title: "折射实验课程设计",
        updatedAt: "2026-10-13T09:00:00.000Z",
      },
      {
        conversationId: "00000000-0000-4000-8000-000000000002",
        title: "整理课堂资料",
        updatedAt: "2026-10-12T09:00:00.000Z",
      },
    ],
    newConversationHref: "/teacher/optics?conversation=new",
    ownerHandle: "teacher",
    sourceCount: 8,
    workspaceHref: "/teacher/optics",
    workspaceName: "光学课程",
  },
};
