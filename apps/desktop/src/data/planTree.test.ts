import { describe, expect, it } from "vitest";
import { buildPlanTreeFromData } from "./planTree";
import type { Plan, Task, Unit } from "./types";

function task(p: Partial<Task>): Task {
  return {
    id: p.id ?? "T",
    unit_id: p.unit_id ?? "U",
    cycle_id: null,
    parent_task_id: null,
    ticket_number: p.ticket_number ?? null,
    idx: p.idx ?? 0,
    title: p.title ?? "Task",
    body: "",
    priority: "medium",
    complexity: null,
    estimated_edits: null,
    type: "task",
    reporter: null,
    assignee: null,
    agent_id: null,
    created_at: "2026-05-14T00:00:00.000Z",
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

function unit(p: Partial<Unit>): Unit {
  return {
    id: p.id ?? "U",
    plan_id: p.plan_id ?? "P",
    idx: p.idx ?? 0,
    title: p.title ?? "Unit",
    goal: null,
    execution_mode: "sequential",
    created_at: "2026-05-14T00:00:00.000Z",
    ...p,
  };
}

function plan(p: Partial<Plan>): Plan {
  return {
    id: p.id ?? "P",
    project_id: "PROJ",
    title: p.title ?? "Plan",
    description: null,
    source: "manual",
    source_path: null,
    created_at: p.created_at ?? "2026-05-14T00:00:00.000Z",
    approved_at: null,
    status: p.status ?? "active",
    ...p,
  };
}

describe("buildPlanTreeFromData", () => {
  it("returns [] when no plans exist", () => {
    expect(buildPlanTreeFromData([], [], [])).toEqual([]);
  });

  it("builds plan → unit → task hierarchy ordered by idx", () => {
    const p = plan({ id: "P1", title: "p" });
    const us = [
      unit({ id: "U2", plan_id: "P1", idx: 2, title: "second" }),
      unit({ id: "U1", plan_id: "P1", idx: 1, title: "first" }),
    ];
    const ts = [
      task({ id: "T2", unit_id: "U1", idx: 2, title: "t2" }),
      task({ id: "T1", unit_id: "U1", idx: 1, title: "t1" }),
      task({ id: "T3", unit_id: "U2", idx: 1, title: "t3" }),
    ];

    const [root] = buildPlanTreeFromData([p], us, ts);
    expect(root!.id).toBe("P1");
    expect(root!.children!.map((u) => u.id)).toEqual(["U1", "U2"]);
    expect(root!.children![0]!.children!.map((t) => t.id)).toEqual([
      "T1",
      "T2",
    ]);
    expect(root!.children![1]!.children!.map((t) => t.id)).toEqual(["T3"]);
  });

  it("marks the active plan defaultExpanded", () => {
    const active = plan({ id: "A", status: "active", created_at: "2026-01-01T00:00:00.000Z" });
    const draft = plan({ id: "B", status: "draft", created_at: "2026-02-01T00:00:00.000Z" });
    const tree = buildPlanTreeFromData([draft, active], [], []);
    // Sorted by created_at ascending: A first, then B.
    expect(tree.map((p) => p.id)).toEqual(["A", "B"]);
    expect(tree[0]!.defaultExpanded).toBe(true);
    expect(tree[1]!.defaultExpanded).toBeFalsy();
  });

  it("uses ticket_number when present and omits ULID fallback", () => {
    const p = plan({ id: "P1" });
    const u = unit({ id: "U1", plan_id: "P1" });
    const ts = [
      task({ id: "T1", unit_id: "U1", ticket_number: "LM-7" }),
      task({ id: "T2", unit_id: "U1", ticket_number: null }),
    ];
    const [root] = buildPlanTreeFromData([p], [u], ts);
    const taskNodes = root!.children![0]!.children!;
    expect(taskNodes[0]!.ticket).toBe("LM-7");
    expect(taskNodes[1]!.ticket).toBeUndefined();
  });

  it("does not expose plan / unit ULID as visible ticket suffix", () => {
    const p = plan({ id: "P1" });
    const u = unit({ id: "U1", plan_id: "P1" });
    const ts = [task({ id: "T1", unit_id: "U1", ticket_number: "LM-1" })];
    const [root] = buildPlanTreeFromData([p], [u], ts);
    expect(root!.ticket).toBeUndefined();
    expect(root!.children![0]!.ticket).toBeUndefined();
  });
});
