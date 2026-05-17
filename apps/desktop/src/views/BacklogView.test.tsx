import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BacklogView } from "./BacklogView";
import { SelectionProvider } from "../shell/selection";
import { DataProvider } from "../data/DataProvider";
import type { DaemonClient } from "../data/api";
import type { Cycle, Plan, Task, Tier, Unit } from "../data/types";

function makeTask(p: Partial<Task>): Task {
  return {
    id: p.id ?? "TASK-X",
    unit_id: p.unit_id ?? "UNIT-1",
    cycle_id: p.cycle_id ?? null,
    parent_task_id: null,
    ticket_number: p.ticket_number ?? "LM-1",
    idx: p.idx ?? 0,
    title: p.title ?? "Task title",
    body: "",
    priority: p.priority ?? "medium",
    complexity: null,
    estimated_edits: null,
    type: "task",
    reporter: null,
    assignee: p.assignee ?? "main",
    agent_id: null,
    created_at: "2026-05-14T05:00:00.000Z",
    started_at: null,
    completed_at: null,
    status: p.status ?? "todo",
    depends_on: [],
    labels: [],
    atomic_size_hint: "small",
    decomposition_policy: "auto",
    tier: (p.tier as Tier | undefined) ?? "med",
    ...p,
  };
}

function makeCycle(
  p: Partial<Cycle> & { id: string; status: Cycle["status"] },
): Cycle {
  return {
    id: p.id,
    project_id: "PROJ-1",
    unit_id: p.unit_id ?? "UNIT-1",
    idx: p.idx ?? 1,
    title: p.title ?? `Cycle ${p.id}`,
    goal: null,
    created_at: "2026-05-14T04:00:00.000Z",
    started_at: p.status === "active" ? "2026-05-14T05:00:00.000Z" : null,
    ended_at: null,
    status: p.status,
  };
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
  title: "Phase",
  goal: null,
  execution_mode: "sequential",
  created_at: "2026-05-14T04:00:00.000Z",
};

interface SeedOpts {
  tasks: Task[];
  cycles?: Cycle[];
  mutations?: Partial<DaemonClient>;
}

function seededClient(opts: SeedOpts): DaemonClient {
  const base: Partial<DaemonClient> = {
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
    listCycles: vi.fn(async () => opts.cycles ?? []),
    listTasks: vi.fn(async () => opts.tasks),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    getPlan: vi.fn(),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
    updateTask: vi.fn(async (_id, _patch) => opts.tasks[0]!),
    activateCycle: vi.fn(async (id) =>
      makeCycle({ id, status: "active", title: "activated" }),
    ),
    completeCycle: vi.fn(async (id) =>
      makeCycle({ id, status: "completed", title: "completed" }),
    ),
    ...opts.mutations,
  };
  return base as DaemonClient;
}

function renderWith(client: DaemonClient) {
  return render(
    <DataProvider projectId="PROJ-1" client={client} disableSse>
      <SelectionProvider>
        <BacklogView />
      </SelectionProvider>
    </DataProvider>,
  );
}

describe("BacklogView (sprint sections, web-parity)", () => {
  it("renders cycle sections + backlog section, bucketing tasks by cycle_id", async () => {
    const cycle = makeCycle({
      id: "CYC-A",
      status: "active",
      title: "Sprint A",
    });
    const tasks: Task[] = [
      makeTask({
        id: "TC1",
        ticket_number: "LM-C1",
        title: "in sprint",
        cycle_id: "CYC-A",
      }),
      makeTask({
        id: "TC2",
        ticket_number: "LM-C2",
        title: "also in sprint",
        cycle_id: "CYC-A",
      }),
      makeTask({
        id: "TD1",
        ticket_number: "LM-D1",
        title: "detached",
        cycle_id: null,
      }),
    ];
    renderWith(seededClient({ tasks, cycles: [cycle] }));

    await waitFor(() => {
      expect(screen.getAllByTestId("backlog-task-row")).toHaveLength(3);
    });

    const cycleList = screen.getByTestId("backlog-section-list-CYC-A");
    expect(within(cycleList).getAllByTestId("backlog-task-row")).toHaveLength(
      2,
    );

    const backlogList = screen.getByTestId("backlog-section-list-backlog");
    expect(within(backlogList).getAllByTestId("backlog-task-row")).toHaveLength(
      1,
    );
    expect(within(backlogList).getByText("detached")).toBeInTheDocument();
  });

  it("excludes completed cycles from the active list", async () => {
    const cycles: Cycle[] = [
      makeCycle({ id: "CYC-DONE", status: "completed", title: "Done" }),
      makeCycle({ id: "CYC-ACTIVE", status: "active", title: "Now" }),
      makeCycle({ id: "CYC-PLAN", status: "planning", title: "Next" }),
    ];
    renderWith(seededClient({ tasks: [], cycles }));

    await waitFor(() => {
      expect(screen.getAllByTestId("backlog-section").length).toBeGreaterThan(
        0,
      );
    });

    const sectionIds = screen
      .getAllByTestId("backlog-section")
      .map((s) => s.getAttribute("data-section-id"));
    expect(sectionIds).toContain("CYC-ACTIVE");
    expect(sectionIds).toContain("CYC-PLAN");
    expect(sectionIds).toContain("backlog");
    expect(sectionIds).not.toContain("CYC-DONE");
  });

  it("renders an empty hint inside the backlog section when no detached tasks exist", async () => {
    const cycle = makeCycle({ id: "CYC-A", status: "active" });
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", cycle_id: "CYC-A" }),
    ];
    renderWith(seededClient({ tasks, cycles: [cycle] }));

    await waitFor(() => {
      expect(
        screen.getByTestId("backlog-section-empty-backlog"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("backlog-section-empty-backlog")).toHaveTextContent(
      /all tasks are assigned/i,
    );
  });

  it("renders an empty hint inside a cycle section with zero tasks", async () => {
    const cycles: Cycle[] = [
      makeCycle({ id: "CYC-A", status: "active", title: "Sprint A" }),
    ];
    renderWith(seededClient({ tasks: [], cycles }));

    await waitFor(() => {
      expect(
        screen.getByTestId("backlog-section-empty-CYC-A"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("backlog-section-empty-CYC-A")).toHaveTextContent(
      /no tasks in this cycle/i,
    );
  });

  it("collapses a cycle section when its toggle is clicked", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({ id: "CYC-A", status: "active" });
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", cycle_id: "CYC-A" }),
    ];
    renderWith(seededClient({ tasks, cycles: [cycle] }));

    await screen.findByTestId("backlog-section-list-CYC-A");
    await user.click(screen.getByTestId("backlog-section-toggle-CYC-A"));
    expect(screen.queryByTestId("backlog-section-list-CYC-A")).toBeNull();
    expect(screen.getByTestId("backlog-section-toggle-CYC-A")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("collapses the backlog section when its toggle is clicked", async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", cycle_id: null }),
    ];
    renderWith(seededClient({ tasks, cycles: [] }));

    await screen.findByTestId("backlog-section-list-backlog");
    await user.click(screen.getByTestId("backlog-section-toggle-backlog"));
    expect(screen.queryByTestId("backlog-section-list-backlog")).toBeNull();
  });

  it("renders done/total count in cycle header", async () => {
    const cycle = makeCycle({ id: "CYC-A", status: "active" });
    const tasks: Task[] = [
      makeTask({
        id: "T1",
        ticket_number: "LM-1",
        cycle_id: "CYC-A",
        status: "done",
      }),
      makeTask({
        id: "T2",
        ticket_number: "LM-2",
        cycle_id: "CYC-A",
        status: "todo",
      }),
      makeTask({
        id: "T3",
        ticket_number: "LM-3",
        cycle_id: "CYC-A",
        status: "cancelled",
      }),
    ];
    renderWith(seededClient({ tasks, cycles: [cycle] }));

    await waitFor(() => {
      expect(
        screen.getByTestId("backlog-section-count-CYC-A"),
      ).toHaveTextContent("2/3");
    });
  });

  it("shows item count on backlog header", async () => {
    const tasks: Task[] = [
      makeTask({ id: "T1", ticket_number: "LM-1", cycle_id: null }),
      makeTask({ id: "T2", ticket_number: "LM-2", cycle_id: null }),
    ];
    renderWith(seededClient({ tasks, cycles: [] }));
    await waitFor(() =>
      expect(
        screen.getByTestId("backlog-section-count-backlog"),
      ).toHaveTextContent(/^2 items$/),
    );
  });

  it("clicking a task row selects it via the selection context", async () => {
    const user = userEvent.setup();
    const tasks: Task[] = [
      makeTask({
        id: "T1",
        ticket_number: "LM-1",
        title: "row-one",
        cycle_id: null,
      }),
    ];
    renderWith(seededClient({ tasks, cycles: [] }));
    const row = await screen.findByTestId("backlog-task-row");
    await user.click(within(row).getByText("row-one"));
    await waitFor(() => {
      expect(screen.getByTestId("backlog-task-row")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });
  });

  it("renders a Start Cycle button on planning cycles and dispatches activate", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({
      id: "CYC-P",
      status: "planning",
      title: "Next sprint",
    });
    const client = seededClient({ tasks: [], cycles: [cycle] });
    renderWith(client);

    const startBtn = await screen.findByTestId("backlog-cycle-start-CYC-P");
    await user.click(startBtn);
    await waitFor(() => {
      expect(client.activateCycle).toHaveBeenCalledWith("CYC-P");
    });
  });

  it("renders an End Cycle button on active cycles and dispatches complete", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({
      id: "CYC-A",
      status: "active",
      title: "Current",
    });
    const client = seededClient({ tasks: [], cycles: [cycle] });
    renderWith(client);

    const endBtn = await screen.findByTestId("backlog-cycle-end-CYC-A");
    await user.click(endBtn);
    await waitFor(() => {
      expect(client.completeCycle).toHaveBeenCalledWith("CYC-A");
    });
  });

  it("× removes a task from its cycle via updateTask({cycle_id: null})", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({ id: "CYC-A", status: "active" });
    const tasks: Task[] = [
      makeTask({
        id: "T1",
        ticket_number: "LM-1",
        cycle_id: "CYC-A",
        title: "to unassign",
      }),
    ];
    const client = seededClient({ tasks, cycles: [cycle] });
    renderWith(client);

    const unassign = await screen.findByTestId("backlog-task-unassign-T1");
    await user.click(unassign);
    await waitFor(() => {
      expect(client.updateTask).toHaveBeenCalledWith("T1", { cycleId: null });
    });
  });

  it("+ Cycle on a backlog task opens a select; choosing a cycle dispatches updateTask", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({
      id: "CYC-A",
      status: "active",
      title: "Sprint A",
    });
    const tasks: Task[] = [
      makeTask({
        id: "TBL",
        ticket_number: "LM-BL",
        cycle_id: null,
        title: "to assign",
      }),
    ];
    const client = seededClient({ tasks, cycles: [cycle] });
    renderWith(client);

    const addBtn = await screen.findByTestId("backlog-task-assign-TBL");
    await user.click(addBtn);

    const select = await screen.findByTestId("backlog-task-cycle-select-TBL");
    await user.selectOptions(select, "CYC-A");

    await waitFor(() => {
      expect(client.updateTask).toHaveBeenCalledWith("TBL", {
        cycleId: "CYC-A",
      });
    });
  });

  it("renders an empty backlog state when no tasks and no cycles exist", async () => {
    renderWith(seededClient({ tasks: [], cycles: [] }));
    // The backlog section is always present; it shows the all-assigned hint.
    await waitFor(() =>
      expect(
        screen.getByTestId("backlog-section-empty-backlog"),
      ).toBeInTheDocument(),
    );
    const sections = screen.getAllByTestId("backlog-section");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveAttribute("data-section-id", "backlog");
  });

  it("scopes tasks to the active project (other-project tasks are excluded)", async () => {
    // Plan + Unit belong to PROJ-1; the second cycle and its task are scoped
    // to a different project. Only PROJ-1's tasks should surface.
    const ownCycle = makeCycle({
      id: "CYC-OWN",
      status: "active",
      title: "Own",
    });
    const otherCycle = makeCycle({
      id: "CYC-OTHER",
      status: "active",
      title: "Other",
      unit_id: "UNIT-OTHER",
    });
    (otherCycle as Cycle & { project_id: string }).project_id = "PROJ-2";
    const tasks: Task[] = [
      makeTask({
        id: "T1",
        ticket_number: "LM-1",
        cycle_id: null,
        unit_id: "UNIT-1",
      }),
      makeTask({
        id: "T2",
        ticket_number: "LM-2",
        cycle_id: "CYC-OTHER",
        unit_id: "UNIT-OTHER",
      }),
    ];
    renderWith(seededClient({ tasks, cycles: [ownCycle, otherCycle] }));

    await waitFor(() => {
      expect(screen.getAllByTestId("backlog-task-row")).toHaveLength(1);
    });
    const sectionIds = screen
      .getAllByTestId("backlog-section")
      .map((s) => s.getAttribute("data-section-id"));
    expect(sectionIds).toContain("CYC-OWN");
    expect(sectionIds).not.toContain("CYC-OTHER");
  });
});

// `useSelection` selected-data assertion via a small smoke component would
// require deeper plumbing; the data-selected attribute is verified above.
