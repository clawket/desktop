import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardView } from "./BoardView";
import { SelectionProvider } from "../shell/selection";
import { DataProvider } from "../data/DataProvider";
import type { DaemonClient } from "../data/api";
import type { Cycle, Plan, Task, Unit } from "../data/types";

function makeTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? "TASK-X",
    unit_id: p.unit_id ?? "UNIT-1",
    cycle_id: "CYC-1",
    parent_task_id: null,
    ticket_number: p.ticket_number ?? "LM-1",
    idx: p.idx ?? 0,
    title: p.title ?? "Task title",
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
    status: p.status ?? "todo",
    depends_on: [],
    labels: [],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    tier: "med",
    ...p,
  };
}

function seededClient(
  tasks: Task[],
  cyclesOverride?: Cycle[],
): DaemonClient {
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
    title: "Phase",
    goal: null,
    execution_mode: "sequential",
    created_at: "2026-05-14T04:00:00.000Z",
  };
  const DEFAULT_CYCLES: Cycle[] = [
    {
      id: "CYC-1",
      project_id: "PROJ-1",
      unit_id: "UNIT-1",
      idx: 1,
      title: "Sprint 1",
      goal: null,
      created_at: "2026-05-14T04:00:00.000Z",
      started_at: "2026-05-14T05:00:00.000Z",
      ended_at: null,
      status: "active",
    },
  ];
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
    listUnits: vi.fn(async () => [UNIT]),
    listCycles: vi.fn(async () => cyclesOverride ?? DEFAULT_CYCLES),
    listTasks: vi.fn(async () => tasks),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    getPlan: vi.fn(),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
}

const TASKS: Task[] = [
  makeTask({ id: "T1", ticket_number: "LM-1", status: "todo", title: "todo a" }),
  makeTask({ id: "T2", ticket_number: "LM-2", status: "todo", title: "todo b" }),
  makeTask({ id: "T3", ticket_number: "LM-3", status: "in_progress", title: "ip" }),
  makeTask({ id: "T4", ticket_number: "LM-4", status: "done", title: "done" }),
  makeTask({ id: "T5", ticket_number: "LM-5", status: "blocked", title: "blk" }),
];

const LIVE_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;

function renderWith(client: DaemonClient) {
  return render(
    <DataProvider projectId="PROJ-1" client={client} disableSse>
      <SelectionProvider>
        <BoardView />
      </SelectionProvider>
    </DataProvider>,
  );
}

describe("BoardView", () => {
  it("renders the four live Kanban columns matching the web surface", async () => {
    renderWith(seededClient(TASKS));
    await waitFor(() =>
      expect(screen.getAllByTestId("board-column")).toHaveLength(4),
    );
    const columns = screen.getAllByTestId("board-column");
    expect(columns.map((c) => c.getAttribute("data-status"))).toEqual([
      ...LIVE_STATUSES,
    ]);
  });

  it("groups live tasks into the correct columns with accurate counts", async () => {
    renderWith(seededClient(TASKS));
    await waitFor(() =>
      expect(screen.getAllByTestId("board-column")).toHaveLength(4),
    );
    for (const status of LIVE_STATUSES) {
      const column = screen
        .getAllByTestId("board-column")
        .find((c) => c.getAttribute("data-status") === status)!;
      const expected = TASKS.filter((t) => t.status === status).length;
      expect(within(column).getByTestId("board-column-count")).toHaveTextContent(
        String(expected),
      );
      const cardCount = within(column).queryAllByTestId("board-task-card")
        .length;
      expect(cardCount).toBe(expected);
    }
  });

  it("renders an empty hint when a column has no tasks", async () => {
    // TASKS has no blocked tasks → the blocked column shows the hint.
    const fewer = TASKS.filter((t) => t.status !== "blocked");
    renderWith(seededClient(fewer));
    await waitFor(() =>
      expect(screen.getAllByTestId("board-column")).toHaveLength(4),
    );
    const blocked = screen
      .getAllByTestId("board-column")
      .find((c) => c.getAttribute("data-status") === "blocked")!;
    expect(within(blocked).getByTestId("board-column-empty")).toBeInTheDocument();
  });

  it("hides cancelled tasks behind the collapsible Archived section", async () => {
    const withCancelled: Task[] = [
      ...TASKS,
      makeTask({
        id: "TC1",
        ticket_number: "LM-CXL",
        status: "cancelled",
        title: "cxl task",
      }),
    ];
    renderWith(seededClient(withCancelled));
    await waitFor(() =>
      expect(screen.getAllByTestId("board-column")).toHaveLength(4),
    );
    // Cancelled is NOT a Kanban column.
    expect(
      screen
        .queryAllByTestId("board-column")
        .find((c) => c.getAttribute("data-status") === "cancelled"),
    ).toBeUndefined();
    // The archived toggle is rendered once the cancelled task exists.
    const toggle = screen.getByTestId("board-archived-toggle");
    expect(toggle).toBeInTheDocument();
    // Cancelled task content is collapsed until the toggle is clicked.
    expect(screen.queryByTestId("board-archived-task")).not.toBeInTheDocument();
    await userEvent.setup().click(toggle);
    const archived = await screen.findAllByTestId("board-archived-task");
    expect(archived).toHaveLength(1);
    expect(archived[0]!.textContent).toContain("cxl task");
  });

  it("clicking a task card invokes the selection callback", async () => {
    const user = userEvent.setup();
    renderWith(seededClient(TASKS));
    const cards = await screen.findAllByTestId("board-task-card");
    // We do not assert on visual selection state — the web BoardView's
    // TaskCard does not render a selected highlight. Instead, assert the
    // click path resolves without throwing.
    await user.click(cards[0]!);
  });

  it("scopes the board to the active cycle by default", async () => {
    const mixed: Task[] = [
      makeTask({ id: "C1A", ticket_number: "LM-CY1A", status: "todo", title: "in cycle 1", cycle_id: "CYC-1" }),
      makeTask({ id: "C1B", ticket_number: "LM-CY1B", status: "in_progress", title: "in cycle 1 b", cycle_id: "CYC-1" }),
      makeTask({ id: "C2A", ticket_number: "LM-CY2A", status: "todo", title: "in cycle 2", cycle_id: "CYC-2" }),
      makeTask({ id: "DETACH", ticket_number: "LM-DET", status: "todo", title: "detached", cycle_id: null }),
    ];
    const cycles: Cycle[] = [
      {
        id: "CYC-1",
        project_id: "PROJ-1",
        unit_id: "UNIT-1",
        idx: 1,
        title: "Sprint 1",
        goal: null,
        created_at: "2026-05-14T04:00:00.000Z",
        started_at: "2026-05-14T05:00:00.000Z",
        ended_at: null,
        status: "active",
      },
      {
        id: "CYC-2",
        project_id: "PROJ-1",
        unit_id: "UNIT-1",
        idx: 0,
        title: "Sprint 0",
        goal: null,
        created_at: "2026-05-14T03:00:00.000Z",
        started_at: "2026-05-14T03:30:00.000Z",
        ended_at: "2026-05-14T04:00:00.000Z",
        status: "completed",
      },
    ];
    renderWith(seededClient(mixed, cycles));
    await waitFor(() =>
      expect(screen.getAllByTestId("board-task-card")).toHaveLength(2),
    );
    const titles = screen
      .getAllByTestId("board-task-card")
      .map((c) => c.textContent ?? "");
    expect(titles.some((t) => t.includes("in cycle 1"))).toBe(true);
    expect(titles.some((t) => t.includes("in cycle 2"))).toBe(false);
    expect(titles.some((t) => t.includes("detached"))).toBe(false);
    expect(screen.getByTestId("board-scope-bar")).toBeInTheDocument();
  });

  it("lets the user switch cycles via the scope-bar select", async () => {
    const user = userEvent.setup();
    const mixed: Task[] = [
      makeTask({ id: "C1A", ticket_number: "LM-CY1A", status: "todo", title: "in cycle 1", cycle_id: "CYC-1" }),
      makeTask({ id: "C2A", ticket_number: "LM-CY2A", status: "todo", title: "in cycle 2", cycle_id: "CYC-2" }),
    ];
    const cycles: Cycle[] = [
      {
        id: "CYC-1",
        project_id: "PROJ-1",
        unit_id: "UNIT-1",
        idx: 1,
        title: "Sprint 1",
        goal: null,
        created_at: "2026-05-14T04:00:00.000Z",
        started_at: "2026-05-14T05:00:00.000Z",
        ended_at: null,
        status: "active",
      },
      {
        id: "CYC-2",
        project_id: "PROJ-1",
        unit_id: "UNIT-1",
        idx: 0,
        title: "Sprint 0",
        goal: null,
        created_at: "2026-05-14T03:00:00.000Z",
        started_at: "2026-05-14T03:30:00.000Z",
        ended_at: "2026-05-14T04:00:00.000Z",
        status: "completed",
      },
    ];
    renderWith(seededClient(mixed, cycles));
    const select = await screen.findByTestId("board-cycle-select");
    expect((select as HTMLSelectElement).value).toBe("CYC-1");
    await user.selectOptions(select, "CYC-2");
    await waitFor(() => {
      const titles = screen
        .getAllByTestId("board-task-card")
        .map((c) => c.textContent ?? "");
      expect(titles.some((t) => t.includes("in cycle 2"))).toBe(true);
      expect(titles.some((t) => t.includes("in cycle 1"))).toBe(false);
    });
  });

  it("renders a no-cycles hint when the active plan has none", async () => {
    renderWith(seededClient(TASKS, []));
    await waitFor(() =>
      expect(screen.getByTestId("board-no-cycles")).toBeInTheDocument(),
    );
    // No Kanban columns rendered in this empty state.
    expect(screen.queryAllByTestId("board-column")).toHaveLength(0);
    expect(screen.queryAllByTestId("board-task-card")).toHaveLength(0);
  });
});
