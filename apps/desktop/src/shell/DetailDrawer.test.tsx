import { describe, it, expect, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanTreeNode } from "@clawket/ui";
import {
  DetailDrawer,
  DRAWER_WIDTH_STORAGE_KEY,
} from "./DetailDrawer";
import { SelectionProvider, useSelection } from "./selection";
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

function seededClient(overrides: {
  plans?: Plan[];
  units?: Unit[];
  cycles?: Cycle[];
  tasks?: Task[];
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
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
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
];

const FULL = { plans: [PLAN], units: UNITS, cycles: CYCLES, tasks: TASKS };

function SeedSelection({
  id,
  kind,
}: {
  id: string | null;
  kind: PlanTreeNode["kind"] | null;
}) {
  // SelectionProvider's `select`/`clear` references are re-created on every
  // state change, so a naive effect would re-seed (re-open the drawer) every
  // time the user clears the selection in a test. Seed exactly once.
  const { select } = useSelection();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (id && kind) {
      seededRef.current = true;
      select(id, kind);
    }
  }, [id, kind, select]);
  return null;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k) {
      return map.has(k) ? (map.get(k) as string) : null;
    },
    key(i) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(k) {
      map.delete(k);
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
  } as Storage;
}

function renderWith(
  seed?: { id: string; kind: PlanTreeNode["kind"] },
  storage?: Storage | null,
) {
  const client = seededClient(FULL);
  return render(
    <DataProvider projectId="PROJ-1" client={client} disableSse>
      <SelectionProvider>
        <SeedSelection
          id={seed?.id ?? null}
          kind={seed?.kind ?? null}
        />
        <DetailDrawer storage={storage} />
      </SelectionProvider>
    </DataProvider>,
  );
}

describe("DetailDrawer", () => {
  it("is hidden (aria-hidden=true) when nothing is selected", async () => {
    renderWith();
    const drawer = await screen.findByTestId("detail-drawer");
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer.dataset.open).toBeUndefined();
    expect(screen.queryByTestId("plan-detail")).toBeNull();
  });

  it("opens with PlanDetail when a plan is selected", async () => {
    renderWith({ id: PLAN.id, kind: "plan" });
    const detail = await screen.findByTestId("plan-detail");
    expect(detail).toHaveAttribute("data-id", PLAN.id);
    expect(
      within(detail).getByRole("heading", { name: PLAN.title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("opens with UnitDetail when a unit is selected", async () => {
    const unit = UNITS[0]!;
    renderWith({ id: unit.id, kind: "unit" });
    const detail = await screen.findByTestId("unit-detail");
    expect(detail).toHaveAttribute("data-id", unit.id);
    expect(
      within(detail).getByRole("heading", { name: unit.title }),
    ).toBeInTheDocument();
  });

  it("opens with TaskDetail when a task is selected", async () => {
    const task = TASKS[0]!;
    renderWith({ id: task.id, kind: "task" });
    const detail = await screen.findByTestId("task-detail");
    expect(detail).toHaveAttribute("data-ticket", task.ticket_number);
    expect(
      within(detail).getByRole("heading", { name: task.title }),
    ).toBeInTheDocument();
  });

  it("closes when the X button is clicked", async () => {
    const user = userEvent.setup();
    renderWith({ id: PLAN.id, kind: "plan" });
    await screen.findByTestId("plan-detail");
    await user.click(screen.getByTestId("detail-drawer-close"));
    await waitFor(() =>
      expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
        "aria-hidden",
        "true",
      ),
    );
    expect(screen.queryByTestId("plan-detail")).toBeNull();
  });

  it("closes on ESC keypress", async () => {
    const user = userEvent.setup();
    renderWith({ id: PLAN.id, kind: "plan" });
    await screen.findByTestId("plan-detail");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
        "aria-hidden",
        "true",
      ),
    );
  });

  it("stays hidden when the selection does not resolve to any entity", async () => {
    renderWith({ id: "DOES-NOT-EXIST", kind: "unit" });
    // Wait until data loads (drawer should still be hidden because resolve fails)
    await waitFor(() =>
      expect(screen.getByTestId("detail-drawer")).toBeInTheDocument(),
    );
    // Small wait to let the data settle; aria-hidden must stay true.
    await waitFor(() =>
      expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
        "aria-hidden",
        "true",
      ),
    );
    expect(screen.queryByTestId("plan-detail")).toBeNull();
    expect(screen.queryByTestId("unit-detail")).toBeNull();
  });

  it("hydrates width from storage on mount", async () => {
    const storage = memoryStorage();
    storage.setItem(DRAWER_WIDTH_STORAGE_KEY, "360");
    renderWith({ id: PLAN.id, kind: "plan" }, storage);
    await screen.findByTestId("plan-detail");
    expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
      "data-width",
      "360",
    );
  });

  it("clamps an out-of-bounds stored width", async () => {
    const storage = memoryStorage();
    storage.setItem(DRAWER_WIDTH_STORAGE_KEY, "9999");
    renderWith({ id: PLAN.id, kind: "plan" }, storage);
    await screen.findByTestId("plan-detail");
    // MAX_WIDTH is 480.
    expect(screen.getByTestId("detail-drawer")).toHaveAttribute(
      "data-width",
      "480",
    );
  });

  it("exposes a resize handle with role=separator", async () => {
    renderWith({ id: PLAN.id, kind: "plan" });
    await screen.findByTestId("plan-detail");
    const handle = screen.getByTestId("detail-drawer-resize-handle");
    expect(handle).toHaveAttribute("role", "separator");
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
  });
});
