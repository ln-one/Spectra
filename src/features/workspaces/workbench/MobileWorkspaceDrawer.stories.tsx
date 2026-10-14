import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MobileWorkspaceDrawer } from "./MobileWorkspaceDrawer";

const meta = {
  component: MobileWorkspaceDrawer,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root min-h-screen bg-[var(--workspace-bg-base)] p-4"
      data-workspace-theme="mist-zinc"
    >
      <MobileWorkspaceDrawer {...args} />
    </div>
  ),
} satisfies Meta<typeof MobileWorkspaceDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    accountMenu: <button type="button">账户</button>,
    conversationId: "00000000-0000-4000-8000-000000000001",
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
    currentWorkspaceId: "workspace-1",
    defaultOpen: true,
    newConversationHref: "/teacher/optics?conversation=new",
    settingsControl: <button type="button">设置</button>,
    workspaceHref: "/teacher/optics",
    workspaces: [
      {
        href: "/teacher/optics",
        id: "workspace-1",
        name: "光学课程",
        ownerHandle: "teacher",
        updatedAt: "2026-10-13T09:00:00.000Z",
      },
      {
        href: "/teacher/calculus",
        id: "workspace-2",
        name: "高等数学",
        ownerHandle: "teacher",
        updatedAt: "2026-10-12T09:00:00.000Z",
      },
    ],
  },
};
