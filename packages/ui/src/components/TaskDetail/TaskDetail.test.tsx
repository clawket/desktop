import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskDetail } from "./TaskDetail";

describe("TaskDetail.Header", () => {
  it("renders ticket, title, and status", () => {
    render(
      <TaskDetail.Header
        ticket="LM-1"
        title="First"
        status="in_progress"
      />,
    );
    expect(screen.getByText("LM-1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "First" })).toBeInTheDocument();
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("renders optional tier / agent / evidence chips", () => {
    render(
      <TaskDetail.Header
        ticket="LM-1"
        title="First"
        status="done"
        tier="high"
        agent="reviewer"
        hasEvidence
      />,
    );
    expect(screen.getByText("tier:high")).toBeInTheDocument();
    expect(screen.getByText("reviewer")).toBeInTheDocument();
    expect(screen.getByText("evidence")).toBeInTheDocument();
  });

  it("renders actions in the right slot", () => {
    render(
      <TaskDetail.Header
        ticket="LM-1"
        title="First"
        status="todo"
        actions={<button>Save</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("TaskDetail.Section", () => {
  it("renders title and children", () => {
    render(
      <TaskDetail.Section title="Evidence">
        <span>has body</span>
      </TaskDetail.Section>,
    );
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByText("has body")).toBeInTheDocument();
  });

  it("shows (empty) placeholder when there are no children", () => {
    render(<TaskDetail.Section title="Evidence">{null}</TaskDetail.Section>);
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });
});

describe("TaskDetail composition", () => {
  it("renders all slots when composed", () => {
    const { container } = render(
      <TaskDetail.Root>
        <TaskDetail.Header ticket="LM-1" title="t" status="todo" />
        <TaskDetail.Body>
          <TaskDetail.Section title="Body">b</TaskDetail.Section>
        </TaskDetail.Body>
      </TaskDetail.Root>,
    );
    expect(
      container.querySelector('[data-slot="task-detail-root"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="task-detail-header"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="task-detail-body"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="task-detail-section"]'),
    ).not.toBeNull();
  });
});
