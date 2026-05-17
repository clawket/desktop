import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { SummaryView } from "./SummaryView";
import { DataProvider } from "../data/DataProvider";
import type { DaemonClient } from "../data/api";
import type {
  Cycle,
  Plan,
  Task,
  TimelineEvent,
  Unit,
} from "../data/types";

function makeTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? "TASK-X",
    unit_id: "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: p.ticket_number ?? "LM-1",
    idx: 0,
    title: "Task title",
    body: "",
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
    status: "todo",
    depends_on: [],
    labels: [],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    ...p,
  };
}

function seededClient(overrides: {
  plans?: Plan[];
  units?: Unit[];
  cycles?: Cycle[];
  tasks?: Task[];
  timeline?: TimelineEvent[];
} = {}): DaemonClient {
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
    listPlans: vi.fn(async () => overrides.plans ?? []),
    listUnits: vi.fn(async () => overrides.units ?? []),
    listCycles: vi.fn(async () => overrides.cycles ?? []),
    listTasks: vi.fn(async () => overrides.tasks ?? []),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => overrides.timeline ?? []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    getPlan: vi.fn(),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
}

const PLAN: Plan = {
  id: "PLAN-1",
  project_id: "PROJ-1",
  title: "Demo plan",
  description: null,
  source: "manual",
  source_path: null,
  created_at: "2026-05-14T04:00:00.000Z",
  approved_at: null,
  status: "active",
};

const UNIT: Unit = {
  id: "UNIT-1",
  plan_id: "PLAN-1",
  idx: 1,
  title: "Phase 5 — data wiring",
  goal: null,
  execution_mode: "sequential",
  created_at: "2026-05-14T04:00:00.000Z",
};

const CYCLE: Cycle = {
  id: "CYC-1",
  project_id: "PROJ-1",
  unit_id: "UNIT-1",
  idx: 1,
  title: "Phase 5",
  goal: null,
  created_at: "2026-05-14T04:00:00.000Z",
  started_at: "2026-05-14T05:00:00.000Z",
  ended_at: null,
  status: "active",
};

function renderWith(client: DaemonClient) {
  return render(
    <DataProvider projectId="PROJ-1" client={client} disableSse>
      <SummaryView />
    </DataProvider>,
  );
}

describe("SummaryView", () => {
  it("renders KPI cards with daemon-sourced counts", async () => {
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", status: "todo" }),
      makeTask({ id: "T2", ticket_number: "LM-2", status: "todo" }),
      makeTask({
        id: "T3",
        ticket_number: "LM-3",
        status: "in_progress",
        title: "Active one",
      }),
      makeTask({ id: "T4", ticket_number: "LM-4", status: "done" }),
      makeTask({ id: "T5", ticket_number: "LM-5", status: "blocked" }),
    ];
    renderWith(
      seededClient({
        plans: [PLAN],
        units: [UNIT],
        cycles: [CYCLE],
        tasks,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("kpi-todo")).toBeInTheDocument(),
    );
    expect(within(screen.getByTestId("kpi-todo")).getByText("2")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("kpi-in_progress")).getByText("1"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-done")).getByText("1")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("kpi-blocked")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("kpi-cancelled")).getByText("0"),
    ).toBeInTheDocument();
  });

  it("highlights the first in-progress task in the active card", async () => {
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", status: "todo" }),
      makeTask({
        id: "T2",
        ticket_number: "LM-99",
        status: "in_progress",
        title: "I am active",
      }),
    ];
    renderWith(
      seededClient({ plans: [PLAN], units: [UNIT], cycles: [CYCLE], tasks }),
    );

    const card = await screen.findByTestId("active-task-card");
    expect(card).toHaveAttribute("data-ticket", "LM-99");
    expect(within(card).getByText("I am active")).toBeInTheDocument();
  });

  it("renders the Overall Progress card with completion percent and legend", async () => {
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", status: "done" }),
      makeTask({ id: "T2", ticket_number: "LM-2", status: "done" }),
      makeTask({ id: "T3", ticket_number: "LM-3", status: "in_progress" }),
      makeTask({ id: "T4", ticket_number: "LM-4", status: "todo" }),
      makeTask({ id: "T5", ticket_number: "LM-5", status: "blocked" }),
    ];
    renderWith(
      seededClient({ plans: [PLAN], units: [UNIT], cycles: [CYCLE], tasks }),
    );

    const card = await screen.findByTestId("overall-progress");
    // 2 closed / 5 total = 40.00%
    expect(
      within(card).getByTestId("overall-progress-percent"),
    ).toHaveTextContent("40.00%");
    expect(within(card).getByText(/Closed 2/)).toBeInTheDocument();
    expect(within(card).getByText(/Active 1/)).toBeInTheDocument();
    expect(within(card).getByText(/Todo 1/)).toBeInTheDocument();
    expect(within(card).getByText(/Blocked 1/)).toBeInTheDocument();
  });

  it("renders timeline rows from the daemon timeline payload", async () => {
    const tasks: Task[] = [makeTask({ id: "T1", ticket_number: "LM-1" })];
    const timeline: TimelineEvent[] = [
      {
        id: "EV-1",
        event_type: "task:done",
        entity_type: "task",
        entity_id: "T1",
        entity_title: "Activated foo",
        actor: "main",
        created_at: 1747200000000,
        detail: { ticket: "LM-1", summary: "Finished." },
      },
    ];
    renderWith(
      seededClient({
        plans: [PLAN],
        units: [UNIT],
        cycles: [CYCLE],
        tasks,
        timeline,
      }),
    );

    const ra = await screen.findByTestId("recent-activity");
    expect(within(ra).getAllByRole("listitem")).toHaveLength(1);
    expect(within(ra).getByText("Activated foo")).toBeInTheDocument();
  });

  it("shows the loading state until initial fetch resolves", () => {
    const slow: DaemonClient = {
      listProjects: () => new Promise(() => {}),
      listPlans: () => new Promise(() => {}),
      listUnits: () => new Promise(() => {}),
      listCycles: () => new Promise(() => {}),
      listTasks: () => new Promise(() => {}),
      listKnowledge: () => new Promise(() => {}),
      listTimeline: () => new Promise(() => {}),
    } as unknown as DaemonClient;
    renderWith(slow);
    expect(screen.getByText("Loading data…")).toBeInTheDocument();
  });

  it("shows the error state when initial fetch rejects", async () => {
    const broken = seededClient();
    (broken.listTasks as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("daemon down"),
    );
    renderWith(broken);
    await waitFor(() =>
      expect(screen.getByTestId("summary-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("summary-error")).toHaveTextContent("daemon down");
  });
});
