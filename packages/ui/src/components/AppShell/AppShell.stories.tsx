import type { Meta, StoryObj } from "@storybook/react";
import { AppShell } from "./AppShell";
import { Button } from "../Button/Button";
import { StatusPill } from "../StatusPill/StatusPill";
import { TierMark } from "../TierMark/TierMark";

const meta = {
  title: "Layout/AppShell",
  component: AppShell.Root,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppShell.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AppShell.Root>
      <AppShell.Sidebar>
        <div className="px-4 py-3 text-headline-md font-display">Clawket</div>
        <nav className="flex flex-col gap-1 px-2 text-body-sm">
          <a className="rounded-md px-3 py-2 text-foreground hover:bg-surface-high">Summary</a>
          <a className="rounded-md bg-surface-high px-3 py-2 text-foreground">Plans</a>
          <a className="rounded-md px-3 py-2 text-foreground hover:bg-surface-high">Board</a>
          <a className="rounded-md px-3 py-2 text-foreground hover:bg-surface-high">Backlog</a>
          <a className="rounded-md px-3 py-2 text-foreground hover:bg-surface-high">Timeline</a>
          <a className="rounded-md px-3 py-2 text-foreground hover:bg-surface-high">Wiki</a>
        </nav>
      </AppShell.Sidebar>
      <AppShell.Content>
        <AppShell.Topbar>
          <span className="text-body-sm text-muted">PROJ-lattice-mono / Desktop 앱 신규 구축</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost">Search ⌘K</Button>
            <Button size="sm" variant="primary">New task</Button>
          </div>
        </AppShell.Topbar>
        <AppShell.Main>
          <div className="flex flex-col gap-3 p-6">
            <h1 className="text-display-xl">Phase 3 — 복합 컴포넌트 + AppShell</h1>
            <div className="flex items-center gap-2">
              <StatusPill status="in_progress" />
              <TierMark tier="med" />
            </div>
            <p className="text-body-base text-muted max-w-2xl">
              AppShell, PlanTree, TaskCard, TaskDetail, CommandSurface 를 작성 중.
              모든 컴포넌트는 packages/ui 의 디자인 토큰과 primitives 위에 합성된다.
            </p>
          </div>
        </AppShell.Main>
      </AppShell.Content>
    </AppShell.Root>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <AppShell.Root>
      <AppShell.Sidebar />
      <AppShell.Content>
        <AppShell.Topbar />
        <AppShell.Main>
          <div className="grid h-full place-items-center text-muted">
            No active plan
          </div>
        </AppShell.Main>
      </AppShell.Content>
    </AppShell.Root>
  ),
};
