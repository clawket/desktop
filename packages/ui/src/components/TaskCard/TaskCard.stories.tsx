import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TaskCard } from "./TaskCard";

const meta = {
  title: "Cards/TaskCard",
  component: TaskCard,
  parameters: { layout: "centered" },
  args: {
    ticket: "LM-10880",
    title: "TaskCard — 컴팩트 task 요약 카드",
    status: "in_progress",
    tier: "med",
    agent: "main",
    hasEvidence: false,
  },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const Done: Story = {
  args: {
    ticket: "LM-10878",
    title: "AppShell — Sidebar + Topbar + main slot",
    status: "done",
    hasEvidence: true,
  },
};

export const Blocked: Story = {
  args: {
    ticket: "LM-10999",
    title: "Phase 4 / Summary view (waiting on data layer)",
    status: "blocked",
    tier: "high",
    agent: "sub-agent-2",
  },
};

export const Stack: Story = {
  render: function StackStory() {
    const [selected, setSelected] = useState("LM-10880");
    const rows = [
      { ticket: "LM-10878", title: "AppShell", status: "done" as const, hasEvidence: true },
      { ticket: "LM-10879", title: "PlanTree", status: "done" as const, hasEvidence: true },
      { ticket: "LM-10880", title: "TaskCard", status: "in_progress" as const, agent: "main" },
      { ticket: "LM-10881", title: "TaskDetail", status: "todo" as const, tier: "med" as const },
      { ticket: "LM-10882", title: "CommandSurface", status: "todo" as const, tier: "low" as const },
    ];
    return (
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <TaskCard
            key={r.ticket}
            {...r}
            selected={selected === r.ticket}
            onClick={() => setSelected(r.ticket)}
          />
        ))}
      </div>
    );
  },
};
