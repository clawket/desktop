import type { Meta, StoryObj } from "@storybook/react";
import { AgentTag } from "./AgentTag";

const meta = {
  title: "Domain/AgentTag",
  component: AgentTag,
  parameters: { layout: "centered" },
  argTypes: {
    agent: { control: "text" },
    size: { control: "radio", options: ["sm", "md"] },
    hideDot: { control: "boolean" },
  },
  args: { agent: "main", size: "sm" },
} satisfies Meta<typeof AgentTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MainAgent: Story = { args: { agent: "main" } };
export const SubAgent: Story = { args: { agent: "sub-agent-1" } };

export const Palette: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <AgentTag agent="main" />
      <AgentTag agent="sub-agent-1" />
      <AgentTag agent="sub-agent-2" />
      <AgentTag agent="sub-agent-3" />
      <AgentTag agent="sub-agent-4" />
      <AgentTag agent="reviewer" />
      <AgentTag agent="planner" />
      <AgentTag agent="executor" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <AgentTag agent="main" size="sm" />
      <AgentTag agent="main" size="md" />
      <AgentTag agent="sub-agent-1" size="md" />
    </div>
  ),
};

export const InRunHeader: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-[28rem]">
      <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
        <AgentTag agent="main" />
        <span className="text-body-base text-foreground">
          LM-10877 in_progress
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2">
        <AgentTag agent="sub-agent-2" />
        <span className="text-body-base text-foreground">
          parallel research run
        </span>
      </div>
    </div>
  ),
};
