import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MobileCreationToolsPage } from "./MobileCreationToolsPage";

const meta = {
  component: MobileCreationToolsPage,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile1" } },
  render: (args) => (
    <div
      className="workspace-theme-root h-dvh bg-[var(--workspace-bg-base)]"
      data-workspace-theme="mist-zinc"
    >
      <MobileCreationToolsPage {...args} />
    </div>
  ),
} satisfies Meta<typeof MobileCreationToolsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { onSelectTool: () => undefined },
};

export const WithUnavailableTool: Story = {
  args: {
    onSelectTool: () => undefined,
    runtimeUnavailableTools: ["animation"],
  },
};
