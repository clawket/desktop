import type { Meta, StoryObj } from "@storybook/react";
import { TaskDetail } from "./TaskDetail";
import { Button } from "../Button/Button";

const meta = {
  title: "Cards/TaskDetail",
  component: TaskDetail.Root,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TaskDetail.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="h-screen w-full">
      <TaskDetail.Root>
        <TaskDetail.Header
          ticket="LM-10881"
          title="TaskDetail — 전체 task 패널"
          status="in_progress"
          tier="med"
          agent="main"
          hasEvidence={false}
          actions={
            <>
              <Button size="sm" variant="ghost">Cancel</Button>
              <Button size="sm" variant="primary">Save</Button>
            </>
          }
        />
        <TaskDetail.Body>
          <TaskDetail.Section title="Body">
            <p>
              Scope: packages/ui/src/components/TaskDetail/ — Compound Pattern
              (Root/Header/Body/Section). Sticky header + scrollable body sections.
            </p>
          </TaskDetail.Section>
          <TaskDetail.Section title="Evidence">
            {""}
          </TaskDetail.Section>
          <TaskDetail.Section title="Comments">
            <ul className="flex flex-col gap-3">
              <li className="rounded-md bg-surface p-3">
                <div className="text-label-sm text-muted">main · just now</div>
                <p className="mt-1">Tracking from Sprint 5.</p>
              </li>
              <li className="rounded-md bg-surface p-3">
                <div className="text-label-sm text-muted">sub-agent-2 · 5m ago</div>
                <p className="mt-1">Reviewer hint: sticky header conflicts with scroll.</p>
              </li>
            </ul>
          </TaskDetail.Section>
        </TaskDetail.Body>
      </TaskDetail.Root>
    </div>
  ),
};

export const Done: Story = {
  render: () => (
    <div className="h-screen w-full">
      <TaskDetail.Root>
        <TaskDetail.Header
          ticket="LM-10878"
          title="AppShell — Sidebar + Topbar + main slot"
          status="done"
          tier="med"
          agent="main"
          hasEvidence
        />
        <TaskDetail.Body>
          <TaskDetail.Section title="Evidence">
            AppShell Compound Pattern 완성. 63 tests passed.
          </TaskDetail.Section>
        </TaskDetail.Body>
      </TaskDetail.Root>
    </div>
  ),
};
