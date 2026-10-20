import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CreationToolMessageBadge } from "./CreationToolMessageBadge";

const meta = {
  component: CreationToolMessageBadge,
  parameters: { layout: "centered", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root rounded-2xl bg-[var(--workspace-surface-muted)] p-4"
      data-workspace-theme="mist-zinc"
    >
      <CreationToolMessageBadge {...args} />
      <p className="text-[15px] text-[var(--workspace-text-primary)]">数理机器学习基础</p>
    </div>
  ),
} satisfies Meta<typeof CreationToolMessageBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MindMap: Story = { args: { kind: "mind_map" } };
export const Presentation: Story = { args: { kind: "presentation" } };
