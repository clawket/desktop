import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailPanels } from "./DetailPanels";
import type { Cycle, Plan, Task, Unit } from "../data/types";

const DRAFT_PLAN: Plan = {
  id: "PLAN-1",
  project_id: "PROJ-1",
  title: "Draft plan",
  description: null,
  source: "manual",
  source_path: null,
  created_at: "2026-01-01T00:00:00.000Z",
  approved_at: null,
  status: "draft",
};

const ACTIVE_PLAN: Plan = { ...DRAFT_PLAN, status: "active" };
const COMPLETED_PLAN: Plan = { ...DRAFT_PLAN, status: "completed" };

describe("PlanDetail action buttons", () => {
  it("shows Approve for draft plans, hides Complete", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[DRAFT_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onApprovePlan={async () => DRAFT_PLAN}
        onCompletePlan={async () => DRAFT_PLAN}
        onUpdatePlan={async () => DRAFT_PLAN}
      />,
    );
    expect(screen.getByTestId("plan-detail-approve")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-detail-complete")).toBeNull();
    expect(screen.getByTestId("plan-detail-edit")).toBeInTheDocument();
  });

  it("shows Complete for active plans, hides Approve", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onApprovePlan={async () => ACTIVE_PLAN}
        onCompletePlan={async () => ACTIVE_PLAN}
        onUpdatePlan={async () => ACTIVE_PLAN}
      />,
    );
    expect(screen.queryByTestId("plan-detail-approve")).toBeNull();
    expect(screen.getByTestId("plan-detail-complete")).toBeInTheDocument();
    expect(screen.getByTestId("plan-detail-edit")).toBeInTheDocument();
  });

  it("hides all mutating buttons when plan is completed", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[COMPLETED_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onApprovePlan={async () => COMPLETED_PLAN}
        onCompletePlan={async () => COMPLETED_PLAN}
        onUpdatePlan={async () => COMPLETED_PLAN}
      />,
    );
    expect(screen.queryByTestId("plan-detail-approve")).toBeNull();
    expect(screen.queryByTestId("plan-detail-complete")).toBeNull();
    expect(screen.queryByTestId("plan-detail-edit")).toBeNull();
  });

  it("hides Approve when no handler is wired (defensive)", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[DRAFT_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
      />,
    );
    expect(screen.queryByTestId("plan-detail-approve")).toBeNull();
    expect(screen.queryByTestId("plan-detail-complete")).toBeNull();
    expect(screen.queryByTestId("plan-detail-edit")).toBeNull();
  });

  it("Approve click invokes onApprovePlan", async () => {
    const user = userEvent.setup();
    const onApprovePlan = vi.fn(async () => DRAFT_PLAN);
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[DRAFT_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onApprovePlan={onApprovePlan}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-approve"));
    await waitFor(() => expect(onApprovePlan).toHaveBeenCalledWith("PLAN-1"));
  });

  it("Complete click confirms before invoking onCompletePlan", async () => {
    const user = userEvent.setup();
    const onCompletePlan = vi.fn(async () => ACTIVE_PLAN);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onCompletePlan={onCompletePlan}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-complete"));
    await waitFor(() => expect(onCompletePlan).toHaveBeenCalledWith("PLAN-1"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Complete cancels when confirm returns false", async () => {
    const user = userEvent.setup();
    const onCompletePlan = vi.fn(async () => ACTIVE_PLAN);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onCompletePlan={onCompletePlan}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-complete"));
    expect(onCompletePlan).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Edit click opens the PlanEditModal", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onUpdatePlan={async () => ACTIVE_PLAN}
      />,
    );
    expect(screen.queryByTestId("plan-edit-modal")).toBeNull();
    await user.click(screen.getByTestId("plan-detail-edit"));
    expect(screen.getByTestId("plan-edit-modal")).toBeInTheDocument();
  });

  it("surfaces approve errors", async () => {
    const user = userEvent.setup();
    const onApprovePlan = vi.fn(async () => {
      throw new Error("FORBIDDEN: project disabled");
    });
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[DRAFT_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onApprovePlan={onApprovePlan}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-approve"));
    await waitFor(() =>
      expect(screen.getByTestId("plan-detail-error")).toHaveTextContent(
        "FORBIDDEN: project disabled",
      ),
    );
  });
});

const UNIT_A: Unit = {
  id: "UNIT-1",
  plan_id: "PLAN-1",
  idx: 0,
  title: "Unit A",
  goal: null,
  execution_mode: "claude",
  created_at: "2026-01-01T00:00:00.000Z",
};

const CYCLE_PLANNING: Cycle = {
  id: "CYC-1",
  project_id: "PROJ-1",
  unit_id: "UNIT-1",
  idx: 0,
  title: "Round 1",
  goal: null,
  created_at: "2026-01-01T00:00:00.000Z",
  started_at: null,
  ended_at: null,
  status: "planning",
};
const CYCLE_ACTIVE: Cycle = { ...CYCLE_PLANNING, status: "active" };
const CYCLE_COMPLETED: Cycle = { ...CYCLE_PLANNING, status: "completed" };

describe("PlanDetail Units section", () => {
  it("shows + Unit button when handler is wired and plan is not completed", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onCreateUnit={async () => UNIT_A}
      />,
    );
    expect(screen.getByTestId("plan-detail-new-unit")).toBeInTheDocument();
  });

  it("opens UnitCreateModal when + Unit clicked", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[]}
        tasks={[]}
        cycles={[]}
        onCreateUnit={async () => UNIT_A}
      />,
    );
    expect(screen.queryByTestId("unit-create-modal")).toBeNull();
    await user.click(screen.getByTestId("plan-detail-new-unit"));
    expect(screen.getByTestId("unit-create-modal")).toBeInTheDocument();
  });

  it("calls onSelectUnit when a unit row is clicked", async () => {
    const user = userEvent.setup();
    const onSelectUnit = vi.fn();
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        onSelectUnit={onSelectUnit}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-unit-UNIT-1"));
    expect(onSelectUnit).toHaveBeenCalledWith("UNIT-1");
  });

  it("disables unit rows when no selection handler is wired", () => {
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
      />,
    );
    expect(screen.getByTestId("plan-detail-unit-UNIT-1")).toBeDisabled();
  });

  it("renders nested task rows under each unit (LM-10985)", () => {
    const task: Task = {
      id: "TASK-1",
      unit_id: "UNIT-1",
      cycle_id: null,
      parent_task_id: null,
      ticket_number: "LM-100",
      idx: 0,
      title: "Nested task",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
      status: "todo",
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[UNIT_A]}
        tasks={[task]}
        cycles={[]}
      />,
    );
    const taskRow = screen.getByTestId("plan-detail-task-TASK-1");
    expect(taskRow).toBeInTheDocument();
    expect(taskRow.textContent).toContain("Nested task");
  });

  it("fires onSelectTask when a nested task row is clicked (LM-10985)", async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    const task: Task = {
      id: "TASK-1",
      unit_id: "UNIT-1",
      cycle_id: null,
      parent_task_id: null,
      ticket_number: "LM-100",
      idx: 0,
      title: "Nested task",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
      status: "todo",
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="plan"
        selectedId="PLAN-1"
        plans={[ACTIVE_PLAN]}
        units={[UNIT_A]}
        tasks={[task]}
        cycles={[]}
        onSelectTask={onSelectTask}
      />,
    );
    await user.click(screen.getByTestId("plan-detail-task-TASK-1"));
    expect(onSelectTask).toHaveBeenCalledWith("TASK-1");
  });
});

describe("UnitDetail action buttons", () => {
  it("renders unit detail when selectedKind=unit", () => {
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
      />,
    );
    expect(screen.getByTestId("unit-detail")).toHaveAttribute(
      "data-id",
      "UNIT-1",
    );
  });

  it("shows Edit/Delete/+Cycle buttons when handlers are wired and projectId present", () => {
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        activeProjectId="PROJ-1"
        onUpdateUnit={async () => UNIT_A}
        onDeleteUnit={async () => undefined}
        onCreateCycle={async () => CYCLE_PLANNING}
      />,
    );
    expect(screen.getByTestId("unit-detail-edit")).toBeInTheDocument();
    expect(screen.getByTestId("unit-detail-delete")).toBeInTheDocument();
    expect(screen.getByTestId("unit-detail-new-cycle")).toBeInTheDocument();
  });

  it("hides + Cycle when projectId missing (cycle create requires project)", () => {
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        onCreateCycle={async () => CYCLE_PLANNING}
      />,
    );
    expect(screen.queryByTestId("unit-detail-new-cycle")).toBeNull();
  });

  it("Edit click opens UnitEditModal", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        onUpdateUnit={async () => UNIT_A}
      />,
    );
    expect(screen.queryByTestId("unit-edit-modal")).toBeNull();
    await user.click(screen.getByTestId("unit-detail-edit"));
    expect(screen.getByTestId("unit-edit-modal")).toBeInTheDocument();
  });

  it("+ Cycle click opens CycleCreateModal", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        activeProjectId="PROJ-1"
        onCreateCycle={async () => CYCLE_PLANNING}
      />,
    );
    expect(screen.queryByTestId("cycle-create-modal")).toBeNull();
    await user.click(screen.getByTestId("unit-detail-new-cycle"));
    expect(screen.getByTestId("cycle-create-modal")).toBeInTheDocument();
  });

  it("Delete confirms before invoking onDeleteUnit", async () => {
    const user = userEvent.setup();
    const onDeleteUnit = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[]}
        onDeleteUnit={onDeleteUnit}
      />,
    );
    await user.click(screen.getByTestId("unit-detail-delete"));
    await waitFor(() => expect(onDeleteUnit).toHaveBeenCalledWith("UNIT-1"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Delete refuses when unit still has tasks (without prompting)", async () => {
    const user = userEvent.setup();
    const onDeleteUnit = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm");
    const childTask: Task = {
      id: "TASK-1",
      unit_id: "UNIT-1",
      cycle_id: null,
      parent_task_id: null,
      ticket_number: null,
      idx: 0,
      title: "child",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
      status: "todo",
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[childTask]}
        cycles={[]}
        onDeleteUnit={onDeleteUnit}
      />,
    );
    await user.click(screen.getByTestId("unit-detail-delete"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDeleteUnit).not.toHaveBeenCalled();
    expect(screen.getByTestId("unit-detail-error")).toHaveTextContent(
      /still has tasks or cycles/i,
    );
    confirmSpy.mockRestore();
  });

  it("Delete refuses when unit still has cycles (without prompting)", async () => {
    const user = userEvent.setup();
    const onDeleteUnit = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm");
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onDeleteUnit={onDeleteUnit}
      />,
    );
    await user.click(screen.getByTestId("unit-detail-delete"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDeleteUnit).not.toHaveBeenCalled();
    expect(screen.getByTestId("unit-detail-error")).toHaveTextContent(
      /still has tasks or cycles/i,
    );
    confirmSpy.mockRestore();
  });

  it("calls onSelectCycle when a cycle row is clicked", async () => {
    const user = userEvent.setup();
    const onSelectCycle = vi.fn();
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onSelectCycle={onSelectCycle}
      />,
    );
    await user.click(screen.getByTestId("unit-detail-cycle-row-CYC-1"));
    expect(onSelectCycle).toHaveBeenCalledWith("CYC-1");
  });

  it("highlights the active cycle in its own section", () => {
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[]}
        cycles={[CYCLE_ACTIVE]}
        onSelectCycle={() => {}}
      />,
    );
    expect(screen.getByTestId("unit-detail-cycle-CYC-1")).toBeInTheDocument();
  });

  it("lists tasks belonging to the unit (LM-10985)", () => {
    const task: Task = {
      id: "TASK-9",
      unit_id: "UNIT-1",
      cycle_id: null,
      parent_task_id: null,
      ticket_number: "LM-9",
      idx: 0,
      title: "Unit-scoped task",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
      status: "in_progress",
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[task]}
        cycles={[]}
      />,
    );
    const row = screen.getByTestId("unit-detail-task-TASK-9");
    expect(row).toBeInTheDocument();
    expect(row.textContent).toContain("Unit-scoped task");
  });

  it("fires onSelectTask when a task row in UnitDetail is clicked (LM-10985)", async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    const task: Task = {
      id: "TASK-9",
      unit_id: "UNIT-1",
      cycle_id: null,
      parent_task_id: null,
      ticket_number: "LM-9",
      idx: 0,
      title: "Unit-scoped task",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
      status: "in_progress",
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="unit"
        selectedId="UNIT-1"
        plans={[]}
        units={[UNIT_A]}
        tasks={[task]}
        cycles={[]}
        onSelectTask={onSelectTask}
      />,
    );
    await user.click(screen.getByTestId("unit-detail-task-TASK-9"));
    expect(onSelectTask).toHaveBeenCalledWith("TASK-9");
  });
});

describe("CycleDetail action buttons", () => {
  it("renders cycle detail when selectedKind=cycle", () => {
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
      />,
    );
    expect(screen.getByTestId("cycle-detail")).toHaveAttribute(
      "data-id",
      "CYC-1",
    );
  });

  it("shows Activate (only) for planning cycles", () => {
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onActivateCycle={async () => CYCLE_PLANNING}
        onCompleteCycle={async () => CYCLE_PLANNING}
      />,
    );
    expect(screen.getByTestId("cycle-detail-activate")).toBeInTheDocument();
    expect(screen.queryByTestId("cycle-detail-complete")).toBeNull();
  });

  it("shows Complete (only) for active cycles", () => {
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_ACTIVE]}
        onActivateCycle={async () => CYCLE_ACTIVE}
        onCompleteCycle={async () => CYCLE_ACTIVE}
      />,
    );
    expect(screen.queryByTestId("cycle-detail-activate")).toBeNull();
    expect(screen.getByTestId("cycle-detail-complete")).toBeInTheDocument();
  });

  it("hides Activate/Complete/Edit when cycle is completed", () => {
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_COMPLETED]}
        onActivateCycle={async () => CYCLE_COMPLETED}
        onCompleteCycle={async () => CYCLE_COMPLETED}
        onUpdateCycle={async () => CYCLE_COMPLETED}
      />,
    );
    expect(screen.queryByTestId("cycle-detail-activate")).toBeNull();
    expect(screen.queryByTestId("cycle-detail-complete")).toBeNull();
    expect(screen.queryByTestId("cycle-detail-edit")).toBeNull();
  });

  it("Activate click invokes onActivateCycle without confirm", async () => {
    const user = userEvent.setup();
    const onActivateCycle = vi.fn(async () => CYCLE_ACTIVE);
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onActivateCycle={onActivateCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-activate"));
    await waitFor(() =>
      expect(onActivateCycle).toHaveBeenCalledWith("CYC-1"),
    );
  });

  it("Complete confirms before invoking onCompleteCycle", async () => {
    const user = userEvent.setup();
    const onCompleteCycle = vi.fn(async () => CYCLE_COMPLETED);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_ACTIVE]}
        onCompleteCycle={onCompleteCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-complete"));
    await waitFor(() =>
      expect(onCompleteCycle).toHaveBeenCalledWith("CYC-1"),
    );
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Complete cancels when confirm returns false", async () => {
    const user = userEvent.setup();
    const onCompleteCycle = vi.fn(async () => CYCLE_COMPLETED);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_ACTIVE]}
        onCompleteCycle={onCompleteCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-complete"));
    expect(onCompleteCycle).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Edit click opens CycleEditModal", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onUpdateCycle={async () => CYCLE_PLANNING}
      />,
    );
    expect(screen.queryByTestId("cycle-edit-modal")).toBeNull();
    await user.click(screen.getByTestId("cycle-detail-edit"));
    expect(screen.getByTestId("cycle-edit-modal")).toBeInTheDocument();
  });

  it("Delete confirms before invoking onDeleteCycle", async () => {
    const user = userEvent.setup();
    const onDeleteCycle = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onDeleteCycle={onDeleteCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-delete"));
    await waitFor(() => expect(onDeleteCycle).toHaveBeenCalledWith("CYC-1"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Delete refuses when cycle still has tasks (without prompting)", async () => {
    const user = userEvent.setup();
    const onDeleteCycle = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm");
    const cycleTask: Task = {
      id: "TASK-2",
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
      parent_task_id: null,
      ticket_number: null,
      idx: 0,
      title: "in cycle",
      body: "",
      priority: "med",
      complexity: null,
      estimated_edits: null,
    } as unknown as Task;
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[cycleTask]}
        cycles={[CYCLE_PLANNING]}
        onDeleteCycle={onDeleteCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-delete"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDeleteCycle).not.toHaveBeenCalled();
    expect(screen.getByTestId("cycle-detail-error")).toHaveTextContent(
      /still has tasks/i,
    );
    confirmSpy.mockRestore();
  });

  it("surfaces activate errors", async () => {
    const user = userEvent.setup();
    const onActivateCycle = vi.fn(async () => {
      throw new Error("FORBIDDEN: another cycle already active on unit");
    });
    render(
      <DetailPanels
        selectedKind="cycle"
        selectedId="CYC-1"
        plans={[]}
        units={[]}
        tasks={[]}
        cycles={[CYCLE_PLANNING]}
        onActivateCycle={onActivateCycle}
      />,
    );
    await user.click(screen.getByTestId("cycle-detail-activate"));
    await waitFor(() =>
      expect(screen.getByTestId("cycle-detail-error")).toHaveTextContent(
        /another cycle already active/i,
      ),
    );
  });
});

const TASK_BASE: Task = {
  id: "TASK-1",
  unit_id: "UNIT-1",
  cycle_id: "CYC-1",
  parent_task_id: null,
  ticket_number: "LM-100",
  idx: 0,
  title: "Wire status mutations",
  body: "task body",
  priority: "med",
  complexity: null,
  estimated_edits: null,
  type: "task",
  reporter: null,
  assignee: null,
  agent_id: null,
  created_at: "2026-05-14T00:00:00.000Z",
  started_at: null,
  completed_at: null,
  status: "in_progress",
  depends_on: [],
  labels: ["ui"],
  atomic_size_hint: "small",
  decomposition_policy: "auto",
  tier: "med",
};

const TASK_TODO: Task = { ...TASK_BASE, status: "todo" };
const TASK_DONE: Task = {
  ...TASK_BASE,
  status: "done",
  evidence: "tests pass",
};
const TASK_CANCELLED: Task = { ...TASK_BASE, status: "cancelled" };

describe("TaskDetailPanel action buttons", () => {
  it("shows Update status / Edit / Delete for in_progress tasks", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onUpdateTask={async () => TASK_BASE}
        onDeleteTask={async () => undefined}
      />,
    );
    expect(screen.getByTestId("task-detail-status")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-edit")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-delete")).toHaveTextContent(
      /cancel/i,
    );
  });

  it("renders Delete (not Cancel) label when task is still in todo", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_TODO]}
        cycles={[]}
        onDeleteTask={async () => undefined}
      />,
    );
    expect(screen.getByTestId("task-detail-delete")).toHaveTextContent(
      /delete/i,
    );
  });

  it("hides Update status / Delete on terminal (done) tasks", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_DONE]}
        cycles={[]}
        onUpdateTask={async () => TASK_DONE}
        onDeleteTask={async () => undefined}
      />,
    );
    expect(screen.queryByTestId("task-detail-status")).toBeNull();
    expect(screen.queryByTestId("task-detail-delete")).toBeNull();
    // Edit is rendered but disabled for terminal tasks.
    expect(screen.getByTestId("task-detail-edit")).toBeDisabled();
  });

  it("hides Update status / Delete on cancelled tasks", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_CANCELLED]}
        cycles={[]}
        onUpdateTask={async () => TASK_CANCELLED}
        onDeleteTask={async () => undefined}
      />,
    );
    expect(screen.queryByTestId("task-detail-status")).toBeNull();
    expect(screen.queryByTestId("task-detail-delete")).toBeNull();
  });

  it("opens the TaskStatusModal when Update status is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onUpdateTask={async () => TASK_BASE}
      />,
    );
    await user.click(screen.getByTestId("task-detail-status"));
    expect(screen.getByTestId("task-status-modal")).toBeInTheDocument();
  });

  it("opens the TaskEditModal when Edit is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onUpdateTask={async () => TASK_BASE}
      />,
    );
    await user.click(screen.getByTestId("task-detail-edit"));
    expect(screen.getByTestId("task-edit-modal")).toBeInTheDocument();
  });

  it("delegates status update to onUpdateTask with evidence", async () => {
    const user = userEvent.setup();
    const onUpdateTask = vi.fn(async () => TASK_DONE);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onUpdateTask={onUpdateTask}
      />,
    );
    await user.click(screen.getByTestId("task-detail-status"));
    await user.click(screen.getByTestId("task-status-option-done"));
    await user.type(screen.getByTestId("task-status-evidence"), "shipped");
    await user.click(screen.getByTestId("task-status-submit"));
    await waitFor(() => expect(onUpdateTask).toHaveBeenCalledTimes(1));
    expect(onUpdateTask).toHaveBeenCalledWith("TASK-1", {
      status: "done",
      evidence: "shipped",
    });
  });

  it("surfaces daemon delete errors on the task detail", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    const onDeleteTask = vi.fn(async () => {
      throw new Error("FORBIDDEN: task is referenced by knowledge");
    });
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onDeleteTask={onDeleteTask}
      />,
    );
    await user.click(screen.getByTestId("task-detail-delete"));
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-error")).toHaveTextContent(
        /referenced by knowledge/i,
      ),
    );
    confirmSpy.mockRestore();
  });

  it("aborts delete when the confirm dialog is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    const onDeleteTask = vi.fn(async () => undefined);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onDeleteTask={onDeleteTask}
      />,
    );
    await user.click(screen.getByTestId("task-detail-delete"));
    expect(onDeleteTask).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("renders the Subtasks section listing direct children sorted by idx", () => {
    const CHILD_A: Task = {
      ...TASK_BASE,
      id: "TASK-A",
      ticket_number: "LM-200",
      parent_task_id: "TASK-1",
      idx: 1,
      title: "Child A",
    };
    const CHILD_B: Task = {
      ...TASK_BASE,
      id: "TASK-B",
      ticket_number: "LM-201",
      parent_task_id: "TASK-1",
      idx: 0,
      title: "Child B",
    };
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE, CHILD_A, CHILD_B]}
        cycles={[]}
      />,
    );
    const list = screen.getByTestId("task-detail-subtasks");
    expect(list).toBeInTheDocument();
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(2);
    // CHILD_B has idx=0, comes first.
    expect(items[0]).toHaveAttribute("data-testid", "task-detail-subtask-TASK-B");
    expect(items[1]).toHaveAttribute("data-testid", "task-detail-subtask-TASK-A");
  });

  it("omits the Subtasks section when there are no children", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
      />,
    );
    expect(screen.queryByTestId("task-detail-subtasks")).toBeNull();
  });

  it("renders the Parent section with a navigable link", async () => {
    const user = userEvent.setup();
    const PARENT: Task = {
      ...TASK_BASE,
      id: "TASK-PAR",
      ticket_number: "LM-99",
      title: "The parent",
    };
    const SELF: Task = {
      ...TASK_BASE,
      id: "TASK-CHILD",
      ticket_number: "LM-100",
      parent_task_id: "TASK-PAR",
    };
    const onSelectTask = vi.fn();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-CHILD"
        plans={[]}
        units={[]}
        tasks={[PARENT, SELF]}
        cycles={[]}
        onSelectTask={onSelectTask}
      />,
    );
    const link = screen.getByTestId("task-detail-parent-link");
    expect(link).toHaveTextContent("LM-99");
    await user.click(link);
    expect(onSelectTask).toHaveBeenCalledWith("TASK-PAR");
  });

  it("shows Add subtask button when onCreateSubtask is provided and task is not terminal", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onCreateSubtask={async () => TASK_BASE}
      />,
    );
    expect(screen.getByTestId("task-detail-add-subtask")).toBeInTheDocument();
  });

  it("hides Add subtask on terminal tasks", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_DONE]}
        cycles={[]}
        onCreateSubtask={async () => TASK_DONE}
      />,
    );
    expect(screen.queryByTestId("task-detail-add-subtask")).toBeNull();
  });

  it("opens the SubtaskCreateModal and delegates submission", async () => {
    const user = userEvent.setup();
    const created: Task = {
      ...TASK_BASE,
      id: "TASK-NEW",
      parent_task_id: "TASK-1",
    };
    const onCreateSubtask = vi.fn(async () => created);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onCreateSubtask={onCreateSubtask}
      />,
    );
    await user.click(screen.getByTestId("task-detail-add-subtask"));
    expect(screen.getByTestId("subtask-create-modal")).toBeInTheDocument();
    await user.type(screen.getByTestId("subtask-create-title"), "Child");
    await user.click(screen.getByTestId("subtask-create-submit"));
    await waitFor(() => expect(onCreateSubtask).toHaveBeenCalledTimes(1));
    expect(onCreateSubtask).toHaveBeenCalledWith("TASK-1", { title: "Child" });
  });
});

describe("TaskDetailPanel Comments / Questions / Runs sections", () => {
  it("renders the Comments panel when onListComments is wired and forwards taskId", async () => {
    const onListComments = vi.fn(async () => []);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onListComments={onListComments}
      />,
    );
    await waitFor(() => expect(onListComments).toHaveBeenCalledWith("TASK-1"));
    expect(screen.getByTestId("task-detail-comments")).toBeInTheDocument();
  });

  it("renders the Questions panel when onListQuestions is wired and forwards taskId", async () => {
    const onListQuestions = vi.fn(async () => []);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onListQuestions={onListQuestions}
      />,
    );
    await waitFor(() =>
      expect(onListQuestions).toHaveBeenCalledWith("TASK-1"),
    );
    expect(screen.getByTestId("task-detail-questions")).toBeInTheDocument();
  });

  it("renders the Runs panel when onListRuns is wired and forwards taskId", async () => {
    const onListRuns = vi.fn(async () => []);
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
        onListRuns={onListRuns}
      />,
    );
    await waitFor(() => expect(onListRuns).toHaveBeenCalledWith("TASK-1"));
    expect(screen.getByTestId("task-detail-runs")).toBeInTheDocument();
  });

  it("omits all three panels when no list handlers are wired", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
      />,
    );
    expect(screen.queryByTestId("task-detail-comments")).toBeNull();
    expect(screen.queryByTestId("task-detail-questions")).toBeNull();
    expect(screen.queryByTestId("task-detail-runs")).toBeNull();
  });
});

describe("TaskDetailPanel web-parity fields (LM-10979)", () => {
  const RICH_TASK: Task = {
    ...TASK_BASE,
    priority: "high",
    complexity: "M",
    estimated_edits: 5,
    started_at: "2026-05-14T01:00:00.000Z",
    scenario_id: "SCEN-42",
    evidence: "src/foo/bar.ts:42",
    batch_id: "BATCH-1",
    depends_on: ["TASK-DEP-1", "TASK-DEP-MISSING"],
  };
  const DEP_TASK: Task = {
    ...TASK_BASE,
    id: "TASK-DEP-1",
    ticket_number: "LM-200",
    title: "Dep one",
    cycle_id: null,
  };
  const SIBLING_TASK: Task = {
    ...TASK_BASE,
    id: "TASK-SIB",
    ticket_number: "LM-300",
    title: "Sibling in batch",
    batch_id: "BATCH-1",
    cycle_id: null,
  };
  const CYC: Cycle = {
    id: "CYC-1",
    project_id: "PROJ-1",
    unit_id: "UNIT-1",
    idx: 3,
    title: "Phase B execution",
    goal: null,
    created_at: "2026-05-13T00:00:00.000Z",
    started_at: null,
    ended_at: null,
    status: "active",
  };

  it("renders priority / complexity / estimated_edits chips above the body", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[RICH_TASK]}
        cycles={[CYC]}
      />,
    );
    expect(screen.getByTestId("task-detail-priority")).toHaveTextContent("high");
    expect(screen.getByTestId("task-detail-complexity")).toHaveTextContent("M");
    expect(
      screen.getByTestId("task-detail-estimated-edits"),
    ).toHaveTextContent("~5 edits");
  });

  it("omits the meta-chip row when no priority / complexity / edits are set", () => {
    const bare: Task = {
      ...TASK_BASE,
      priority: "",
      complexity: null,
      estimated_edits: null,
    };
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[bare]}
        cycles={[]}
      />,
    );
    expect(screen.queryByTestId("task-detail-meta-chips")).toBeNull();
  });

  it("renders the Status / Assignee / Cycle row with the resolved cycle title", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[{ ...RICH_TASK, assignee: "alice" }]}
        cycles={[CYC]}
      />,
    );
    const row = screen.getByTestId("task-detail-status-row");
    expect(row).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-assignee")).toHaveTextContent(
      "alice",
    );
    expect(screen.getByTestId("task-detail-cycle")).toHaveTextContent(
      "#3 Phase B execution",
    );
  });

  it("clicking the cycle in the status row fires onSelectTask for the cycle", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[RICH_TASK]}
        cycles={[CYC]}
        onSelectTask={onSelect}
      />,
    );
    await user.click(screen.getByTestId("task-detail-cycle"));
    expect(onSelect).toHaveBeenCalledWith("CYC-1");
  });

  it("renders Created / Started / Completed timestamps with em-dash placeholders", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[RICH_TASK]}
        cycles={[CYC]}
      />,
    );
    expect(screen.getByTestId("task-detail-timestamps")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-created-at").textContent).not.toBe(
      "—",
    );
    expect(screen.getByTestId("task-detail-started-at").textContent).not.toBe(
      "—",
    );
    expect(screen.getByTestId("task-detail-completed-at")).toHaveTextContent(
      "—",
    );
  });

  it("renders PDD metadata (scenario_id, evidence as source link, batch siblings)", async () => {
    const user = userEvent.setup();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[RICH_TASK, SIBLING_TASK]}
        cycles={[CYC]}
      />,
    );
    expect(screen.getByTestId("task-detail-pdd")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-scenario-id")).toHaveTextContent(
      "SCEN-42",
    );
    const evidence = screen.getByTestId("task-detail-evidence-value");
    expect(evidence.querySelector("a")).toHaveAttribute(
      "href",
      "#evidence:src/foo/bar.ts:42",
    );
    expect(evidence).toHaveTextContent("src/foo/bar.ts:42");
    const batch = screen.getByTestId("task-detail-batch-id");
    expect(batch).toHaveTextContent("BATCH-1");
    const expander = screen.getByRole("button", {
      name: /show 1 task in batch/i,
    });
    await user.click(expander);
    expect(
      screen.getByRole("button", { name: /LM-300 — Sibling in batch/ }),
    ).toBeInTheDocument();
  });

  it("renders em-dash when scenario_id / evidence / batch_id are absent", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
      />,
    );
    expect(screen.getByTestId("task-detail-scenario-id")).toHaveTextContent(
      "—",
    );
    expect(screen.getByTestId("task-detail-evidence-value")).toHaveTextContent(
      "—",
    );
    expect(screen.getByTestId("task-detail-batch-id")).toHaveTextContent("—");
  });

  it("renders depends_on dependencies, resolves tickets, and forwards onSelectTask", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[RICH_TASK, DEP_TASK]}
        cycles={[CYC]}
        onSelectTask={onSelect}
      />,
    );
    const list = screen.getByTestId("task-detail-depends-on");
    expect(list).toBeInTheDocument();
    // resolved sibling shows its ticket_number
    expect(list).toHaveTextContent("LM-200");
    // unresolved id falls back to its tail
    expect(list).toHaveTextContent("…ISSING");
    await user.click(screen.getByRole("button", { name: "LM-200" }));
    expect(onSelect).toHaveBeenCalledWith("TASK-DEP-1");
  });

  it("hides the Dependencies section when depends_on is empty", () => {
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[TASK_BASE]}
        cycles={[]}
      />,
    );
    expect(screen.queryByTestId("task-detail-depends-on")).toBeNull();
  });

  it("renders the body section as markdown content", () => {
    const md: Task = {
      ...TASK_BASE,
      body: "## Heading\n\n- a\n- b",
    };
    render(
      <DetailPanels
        selectedKind="task"
        selectedId="TASK-1"
        plans={[]}
        units={[]}
        tasks={[md]}
        cycles={[]}
      />,
    );
    const body = screen.getByTestId("task-detail-body");
    expect(body.querySelector("h2")).toHaveTextContent("Heading");
    expect(body.querySelectorAll("li")).toHaveLength(2);
  });
});
