import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskCard } from "./TaskCard";

describe("TaskCard", () => {
  it("renders ticket and title", () => {
    render(
      <TaskCard ticket="LM-1" title="First task" status="todo" />,
    );
    expect(screen.getByText("LM-1")).toBeInTheDocument();
    expect(screen.getByText("First task")).toBeInTheDocument();
  });

  it("renders the StatusPill", () => {
    render(<TaskCard ticket="LM-1" title="t" status="in_progress" />);
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("renders TierMark only when tier is provided", () => {
    const { rerender } = render(
      <TaskCard ticket="LM-1" title="t" status="todo" />,
    );
    expect(screen.queryByText(/tier:/)).toBeNull();
    rerender(
      <TaskCard ticket="LM-1" title="t" status="todo" tier="high" />,
    );
    expect(screen.getByText("tier:high")).toBeInTheDocument();
  });

  it("renders AgentTag only when agent is provided", () => {
    const { rerender } = render(
      <TaskCard ticket="LM-1" title="t" status="todo" />,
    );
    expect(screen.queryByText("main")).toBeNull();
    rerender(<TaskCard ticket="LM-1" title="t" status="todo" agent="main" />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders EvidenceChip when hasEvidence is set (true or false)", () => {
    const { rerender } = render(
      <TaskCard ticket="LM-1" title="t" status="todo" hasEvidence />,
    );
    expect(screen.getByText("evidence")).toBeInTheDocument();
    rerender(
      <TaskCard
        ticket="LM-1"
        title="t"
        status="todo"
        hasEvidence={false}
      />,
    );
    expect(screen.getByText("no evidence")).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TaskCard ticket="LM-1" title="t" status="todo" onClick={onClick} />,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("removes the button role when inactive is true", () => {
    render(<TaskCard ticket="LM-1" title="t" status="todo" inactive />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("flags data-selected when selected is true", () => {
    render(
      <TaskCard ticket="LM-1" title="t" status="todo" selected />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-selected", "true");
  });

  it("exposes the ticket via data-task-card for E2E targeting", () => {
    render(<TaskCard ticket="LM-99" title="t" status="todo" />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-task-card",
      "LM-99",
    );
  });
});
