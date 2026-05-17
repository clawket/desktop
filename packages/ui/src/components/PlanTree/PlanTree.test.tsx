import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanTree, type PlanTreeNode } from "./PlanTree";

const TREE: PlanTreeNode[] = [
  {
    id: "p1",
    kind: "plan",
    label: "Plan",
    defaultExpanded: true,
    children: [
      {
        id: "u1",
        kind: "unit",
        label: "Unit one",
        defaultExpanded: false,
        children: [
          { id: "t1", kind: "task", label: "First", ticket: "LM-1", status: "todo" },
          { id: "t2", kind: "task", label: "Second", ticket: "LM-2", status: "in_progress" },
        ],
      },
    ],
  },
];

describe("PlanTree", () => {
  it("renders root nodes and respects defaultExpanded=false collapse", () => {
    render(<PlanTree nodes={TREE} />);
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Unit one")).toBeInTheDocument();
    expect(screen.queryByText("First")).toBeNull();
  });

  it("expands a collapsed branch when the chevron is clicked", async () => {
    const user = userEvent.setup();
    render(<PlanTree nodes={TREE} />);
    await user.click(screen.getByLabelText("Expand"));
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("fires onSelect with the clicked node", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PlanTree nodes={TREE} onSelect={onSelect} />);
    await user.click(screen.getByText("Plan"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]!.id).toBe("p1");
  });

  it("renders a StatusPill on task rows", async () => {
    const user = userEvent.setup();
    render(<PlanTree nodes={TREE} />);
    await user.click(screen.getByLabelText("Expand"));
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("marks the active node with data-active", () => {
    const { container } = render(<PlanTree nodes={TREE} activeId="p1" />);
    const active = container.querySelector('[data-node-id="p1"]');
    expect(active).toHaveAttribute("data-active", "true");
  });

  it("exposes node kind via data-node-kind", () => {
    const { container } = render(<PlanTree nodes={TREE} />);
    expect(
      container.querySelector('[data-node-id="p1"]'),
    ).toHaveAttribute("data-node-kind", "plan");
  });

  it("renders plan status pill and data-plan-status attribute", () => {
    const tree: PlanTreeNode[] = [
      { id: "pa", kind: "plan", label: "Active plan", planStatus: "active" },
      { id: "pd", kind: "plan", label: "Draft plan", planStatus: "draft" },
      { id: "pc", kind: "plan", label: "Done plan", planStatus: "completed" },
    ];
    const { container } = render(<PlanTree nodes={tree} />);
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(container.querySelector('[data-node-id="pa"]')).toHaveAttribute(
      "data-plan-status",
      "active",
    );
    expect(container.querySelector('[data-node-id="pc"]')).toHaveAttribute(
      "data-plan-status",
      "completed",
    );
  });

  it("shows an Approve button on draft plans and invokes onApprovePlan", async () => {
    const user = userEvent.setup();
    const onApprovePlan = vi.fn();
    const tree: PlanTreeNode[] = [
      { id: "pd", kind: "plan", label: "Draft plan", planStatus: "draft" },
    ];
    render(<PlanTree nodes={tree} onApprovePlan={onApprovePlan} />);
    const btn = screen.getByRole("button", { name: "Approve" });
    await user.click(btn);
    expect(onApprovePlan).toHaveBeenCalledTimes(1);
    expect(onApprovePlan.mock.calls[0]![0]!.id).toBe("pd");
  });

  it("hides the Approve button on non-draft plans", () => {
    const tree: PlanTreeNode[] = [
      { id: "pa", kind: "plan", label: "Active", planStatus: "active" },
    ];
    render(<PlanTree nodes={tree} onApprovePlan={() => {}} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("renders a unit progress bar when progress is provided", () => {
    const tree: PlanTreeNode[] = [
      {
        id: "p",
        kind: "plan",
        label: "P",
        defaultExpanded: true,
        children: [
          {
            id: "u",
            kind: "unit",
            label: "U",
            progress: { done: 2, total: 5 },
          },
        ],
      },
    ];
    render(<PlanTree nodes={tree} />);
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByLabelText("Progress 2 of 5")).toBeInTheDocument();
  });
});
