import type { Meta, StoryObj } from "@storybook/react";
import { StatusPill, type TaskStatus } from "./StatusPill";

const meta = {
  title: "Domain/StatusPill",
  component: StatusPill,
  parameters: { layout: "centered" },
  argTypes: {
    status: {
      control: "select",
      options: ["todo", "in_progress", "blocked", "done", "cancelled"],
    },
    size: { control: "radio", options: ["sm", "md"] },
    hideDot: { control: "boolean" },
  },
  args: { status: "in_progress", size: "sm" },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {ALL.map((s) => (
        <StatusPill key={s} status={s} />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {ALL.map((s) => (
        <StatusPill key={s} status={s} size="md" />
      ))}
    </div>
  ),
};

export const WithoutDot: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {ALL.map((s) => (
        <StatusPill key={s} status={s} hideDot />
      ))}
    </div>
  ),
};

export const InRow: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-96">
      <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
        <span className="text-body-base text-foreground">LM-10876 Badge</span>
        <StatusPill status="done" />
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
        <span className="text-body-base text-foreground">LM-10877 Domain</span>
        <StatusPill status="in_progress" />
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
        <span className="text-body-base text-foreground">LM-10999 Future</span>
        <StatusPill status="blocked" />
      </div>
    </div>
  ),
};
