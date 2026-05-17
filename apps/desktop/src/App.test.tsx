import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { DaemonClient } from "./data/api";
import type { Cycle, Plan, Task, Unit } from "./data/types";

describe("App shell", () => {
  it("renders sidebar + topbar + Summary as the default view", () => {
    render(<App />);
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("view-summary")).toBeInTheDocument();
  });

  it("activates the Summary view tab by default", () => {
    render(<App />);
    const summaryTab = screen.getByRole("tab", { name: "Summary" });
    expect(summaryTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders one tab per registered view", () => {
    render(<App />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("switches the main panel when a different view tab is clicked", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Board" }));
    expect(screen.getByTestId("view-board")).toBeInTheDocument();
    expect(screen.queryByTestId("view-summary")).toBeNull();
    expect(screen.getByRole("tab", { name: "Board" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the daemon health pill in the topbar", () => {
    render(<App />);
    expect(screen.getByTestId("daemon-health")).toBeInTheDocument();
  });

  it("opens the command palette when ⌘K button is clicked", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open-command-palette"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

function makeTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? "TASK-X",
    unit_id: p.unit_id ?? "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: p.ticket_number ?? "LM-1",
    idx: p.idx ?? 0,
    title: p.title ?? "Task title",
    body: p.body ?? "",
    priority: "medium",
    complexity: null,
    estimated_edits: null,
    type: "task",
    reporter: null,
    assignee: "main",
    agent_id: null,
    created_at: "2026-05-14T05:00:00.000Z",
    started_at: null,
    completed_at: null,
    status: p.status ?? "todo",
    depends_on: [],
    labels: [],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    ...p,
  };
}

const PLAN: Plan = {
  id: "PLAN-1",
  project_id: "PROJ-1",
  title: "Desktop rebuild",
  description: "Replace web with Tauri.",
  source: "manual",
  source_path: null,
  created_at: "2026-05-14T04:00:00.000Z",
  approved_at: "2026-05-14T04:30:00.000Z",
  status: "active",
};

const UNITS: Unit[] = [
  {
    id: "UNIT-1",
    plan_id: "PLAN-1",
    idx: 1,
    title: "Phase 1 — scaffolding",
    goal: "Tauri shell up.",
    execution_mode: "sequential",
    created_at: "2026-05-14T04:00:00.000Z",
  },
];

const CYCLES: Cycle[] = [
  {
    id: "CYC-1",
    project_id: "PROJ-1",
    unit_id: "UNIT-1",
    idx: 1,
    title: "Phase 1 sprint",
    goal: null,
    created_at: "2026-05-14T04:00:00.000Z",
    started_at: "2026-05-14T05:00:00.000Z",
    ended_at: null,
    status: "active",
  },
];

const TASKS: Task[] = [
  makeTask({
    id: "T1",
    ticket_number: "LM-1",
    unit_id: "UNIT-1",
    idx: 1,
    title: "Bootstrap repo",
    status: "in_progress",
  }),
  makeTask({
    id: "T2",
    ticket_number: "LM-2",
    unit_id: "UNIT-1",
    idx: 2,
    title: "Wire DataProvider",
    status: "todo",
  }),
];

function seededClient(): DaemonClient {
  return {
    listProjects: vi.fn(async () => [
      {
        id: "PROJ-1",
        name: "Test Project",
        description: null,
        key: null,
        enabled: 1,
        wiki_paths: [],
        cwds: [],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]),
    listPlans: vi.fn(async () => [PLAN]),
    listUnits: vi.fn(async () => UNITS),
    listCycles: vi.fn(async () => CYCLES),
    listTasks: vi.fn(async () => TASKS),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    getPlan: vi.fn(),
    decomposeTask: vi.fn(async () => ({
      parent: { id: "T1", ticket_number: "LM-1", title: "Bootstrap repo" },
      strategy: "auto",
      max_depth: 2,
      existing_children_count: 0,
      suggested_subtasks: [],
      policy_violations: [],
    })),
    createSubtask: vi.fn(async () => makeTask({ id: "T-child" })),
    health: vi.fn(async () => true),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
}

describe("Command palette → selection (B1)", () => {
  async function openPalette() {
    const user = userEvent.setup();
    render(<App client={seededClient()} disableSse projectId="PROJ-1" />);
    // Wait for seeded data so the palette has plan/task items to render.
    await screen.findByTestId("daemon-health");
    await user.click(screen.getByTestId("open-command-palette"));
    return user;
  }

  it("clicking a Task row selects the task and opens DetailDrawer", async () => {
    const user = await openPalette();
    const dialog = await screen.findByRole("dialog");
    // Wait for the seeded task to appear as a palette option.
    const taskOption = await within(dialog).findByText("Bootstrap repo");
    await user.click(taskOption);
    // Palette closes.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // DetailDrawer opens with the task.
    await waitFor(() => {
      const drawer = screen.getByTestId("detail-drawer");
      expect(drawer).toHaveAttribute("data-open", "true");
    });
    expect(screen.getByTestId("task-detail")).toHaveAttribute(
      "data-ticket",
      "LM-1",
    );
  });

  it("clicking a Plan row selects the plan", async () => {
    const user = await openPalette();
    const dialog = await screen.findByRole("dialog");
    const planOption = await within(dialog).findByText("Desktop rebuild");
    await user.click(planOption);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId("plan-detail")).toHaveAttribute(
        "data-id",
        "PLAN-1",
      ),
    );
  });

  it("clicking a Unit row selects the unit", async () => {
    const user = await openPalette();
    const dialog = await screen.findByRole("dialog");
    const unitOption = await within(dialog).findByText("Phase 1 — scaffolding");
    await user.click(unitOption);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId("unit-detail")).toHaveAttribute(
        "data-id",
        "UNIT-1",
      ),
    );
  });

  it("clicking a View row switches the active view", async () => {
    const user = await openPalette();
    const dialog = await screen.findByRole("dialog");
    const boardOption = await within(dialog).findByText("Open Board view");
    await user.click(boardOption);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("view-board")).toBeInTheDocument();
  });

  it("pressing Enter on a Task row selects the task (keyboard parity)", async () => {
    const user = await openPalette();
    const dialog = await screen.findByRole("dialog");
    // Type to filter to the task, then Enter on the first match.
    await within(dialog).findByText("Bootstrap repo");
    await user.keyboard("Bootstrap");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId("task-detail")).toHaveAttribute(
        "data-ticket",
        "LM-1",
      ),
    );
  });
});
