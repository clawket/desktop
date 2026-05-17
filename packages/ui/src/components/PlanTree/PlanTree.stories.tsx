import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlanTree, type PlanTreeNode } from "./PlanTree";

const meta = {
  title: "Layout/PlanTree",
  component: PlanTree,
  parameters: { layout: "padded" },
  args: { nodes: [] },
} satisfies Meta<typeof PlanTree>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE: PlanTreeNode[] = [
  {
    id: "PLAN-1",
    kind: "plan",
    label: "Desktop 앱 신규 구축 (Tauri / Stitch)",
    defaultExpanded: true,
    children: [
      {
        id: "UNIT-1",
        kind: "unit",
        label: "Phase 2: 디자인 토큰 + 단순 컴포넌트",
        defaultExpanded: true,
        children: [
          { id: "T-10873", kind: "task", ticket: "LM-10873", label: "tokens.css 보강", status: "done" },
          { id: "T-10874", kind: "task", ticket: "LM-10874", label: "Button + CVA", status: "done" },
          { id: "T-10875", kind: "task", ticket: "LM-10875", label: "Input + FormField", status: "done" },
          { id: "T-10876", kind: "task", ticket: "LM-10876", label: "Badge", status: "done" },
          { id: "T-10877", kind: "task", ticket: "LM-10877", label: "도메인 컴포넌트", status: "done" },
        ],
      },
      {
        id: "UNIT-2",
        kind: "unit",
        label: "Phase 3: 복합 컴포넌트 + AppShell",
        defaultExpanded: true,
        children: [
          { id: "T-10878", kind: "task", ticket: "LM-10878", label: "AppShell", status: "done" },
          { id: "T-10879", kind: "task", ticket: "LM-10879", label: "PlanTree", status: "in_progress" },
          { id: "T-10880", kind: "task", ticket: "LM-10880", label: "TaskCard", status: "todo" },
          { id: "T-10881", kind: "task", ticket: "LM-10881", label: "TaskDetail", status: "todo" },
          { id: "T-10882", kind: "task", ticket: "LM-10882", label: "CommandSurface", status: "todo" },
        ],
      },
      {
        id: "UNIT-3",
        kind: "unit",
        label: "Phase 4: 6 뷰 마이그레이션",
        children: [
          { id: "T-blocked", kind: "task", label: "Summary view", status: "blocked" },
        ],
      },
    ],
  },
];

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <PlanTree nodes={SAMPLE} />
    </div>
  ),
};

export const WithSelection: Story = {
  render: function WithSelectionStory() {
    const [activeId, setActiveId] = useState("T-10879");
    return (
      <div className="w-80">
        <PlanTree
          nodes={SAMPLE}
          activeId={activeId}
          onSelect={(n) => setActiveId(n.id)}
        />
      </div>
    );
  },
};

export const Collapsed: Story = {
  render: () => (
    <div className="w-80">
      <PlanTree
        nodes={[
          {
            ...SAMPLE[0]!,
            children: SAMPLE[0]!.children!.map((u) => ({
              ...u,
              defaultExpanded: false,
            })),
          },
        ]}
      />
    </div>
  ),
};
