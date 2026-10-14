import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MobileCreationToolChip } from "./MobileCreationToolChip";

const meta = {
  component: MobileCreationToolChip,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root min-h-screen bg-[var(--workspace-bg-base)] p-4"
      data-workspace-theme="mist-zinc"
    >
      <div className="workspace-chat-input-shell rounded-[22px] border bg-[var(--workspace-surface)] p-2 shadow-sm">
        <MobileCreationToolChip {...args} />
        <p className="px-5 py-3 text-sm text-[var(--workspace-text-muted)]">输入你的想法或任务</p>
      </div>
    </div>
  ),
} satisfies Meta<typeof MobileCreationToolChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SmartSlides: Story = {
  args: { onClear: () => undefined, toolId: "smart-slides" },
};

export const TeachingDocument: Story = {
  args: { onClear: () => undefined, toolId: "teaching-document" },
};
