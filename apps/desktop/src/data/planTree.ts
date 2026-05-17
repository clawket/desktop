import type { PlanTreeNode } from "@clawket/ui";
import type { Plan, Task, Unit } from "./types";

function taskTicket(t: Task): string | undefined {
  return t.ticket_number ?? undefined;
}

function unitTicket(_u: Unit): string | undefined {
  return undefined;
}

function planTicket(_p: Plan): string | undefined {
  return undefined;
}

/**
 * Build a PlanTreeNode forest from live daemon entities. Each plan becomes a
 * root with its units as children; each unit's children are the tasks whose
 * unit_id matches. Sort order:
 *   - plans by created_at ascending (oldest first)
 *   - units by idx ascending
 *   - tasks by idx ascending
 */
export function buildPlanTreeFromData(
  plans: Plan[],
  units: Unit[],
  tasks: Task[],
): PlanTreeNode[] {
  if (plans.length === 0) return [];

  const sortedPlans = [...plans].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const tasksByUnit = new Map<string, Task[]>();
  for (const t of tasks) {
    const list = tasksByUnit.get(t.unit_id) ?? [];
    list.push(t);
    tasksByUnit.set(t.unit_id, list);
  }
  for (const list of tasksByUnit.values()) {
    list.sort((a, b) => a.idx - b.idx);
  }

  const CLOSED: ReadonlySet<Task["status"]> = new Set(["done", "cancelled"]);

  return sortedPlans.map((p) => {
    const planUnits = units
      .filter((u) => u.plan_id === p.id)
      .slice()
      .sort((a, b) => a.idx - b.idx);

    let planDone = 0;
    let planTotal = 0;

    const unitNodes: PlanTreeNode[] = planUnits.map((u) => {
      const items = tasksByUnit.get(u.id) ?? [];
      const done = items.filter((t) => CLOSED.has(t.status)).length;
      planDone += done;
      planTotal += items.length;
      return {
        id: u.id,
        kind: "unit",
        label: u.title,
        ticket: unitTicket(u),
        progress: { done, total: items.length },
        children: items.map<PlanTreeNode>((t) => ({
          id: t.id,
          kind: "task",
          label: t.title,
          ticket: taskTicket(t),
          status: t.status,
        })),
      };
    });

    return {
      id: p.id,
      kind: "plan",
      label: p.title,
      ticket: planTicket(p),
      planStatus: p.status,
      progress: { done: planDone, total: planTotal },
      children: unitNodes,
      defaultExpanded: p.status === "active",
    };
  });
}
