import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppShell, PlanTree, cn, type PlanTreeNode } from "@clawket/ui";
import { useData } from "../data/DataProvider";
import type { Cycle, Plan, Unit } from "../data/types";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { PlanCreateModal } from "./PlanCreateModal";
import { ProjectSettingsModal } from "./ProjectSettingsModal";
import { BrandMark } from "./BrandMark";

export const SIDEBAR_WIDTH_STORAGE_KEY = "clawket.sidebarWidth";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "clawket.sidebarCollapsed";
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288; // matches AppShell.Sidebar's default w-72.
const COLLAPSED_WIDTH = 48;

function clampWidth(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  if (n < MIN_WIDTH) return MIN_WIDTH;
  if (n > MAX_WIDTH) return MAX_WIDTH;
  return Math.round(n);
}

function resolveStorage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredWidth(storage: Storage | null): number {
  if (!storage) return DEFAULT_WIDTH;
  try {
    const raw = storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number.parseInt(raw, 10);
    return clampWidth(n);
  } catch {
    return DEFAULT_WIDTH;
  }
}

function writeStoredWidth(storage: Storage | null, width: number): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Storage may be unavailable (private mode, quota); ignore.
  }
}

function readStoredCollapsed(storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredCollapsed(storage: Storage | null, collapsed: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage may be unavailable; ignore.
  }
}

interface SidebarProps {
  nodes: PlanTreeNode[];
  activeId: string | null;
  onSelect: (node: PlanTreeNode) => void;
  storage?: Storage | null;
}

function pickActivePlan(plans: Plan[]): Plan | null {
  return plans.find((p) => p.status === "active") ?? plans[0] ?? null;
}

function pickActiveCycle(
  cycles: Cycle[],
  units: Unit[],
  plan: Plan | null,
): Cycle | null {
  if (!plan) return null;
  const planUnitIds = new Set(
    units.filter((u) => u.plan_id === plan.id).map((u) => u.id),
  );
  return (
    cycles.find(
      (c) => c.status === "active" && c.unit_id !== null && planUnitIds.has(c.unit_id),
    ) ?? null
  );
}

export function Sidebar({ nodes, activeId, onSelect, storage }: SidebarProps) {
  const {
    plans,
    units,
    cycles,
    projects,
    activeProjectId,
    setActiveProject,
    createProject,
    updateProject,
    createPlan,
    approvePlan,
  } = useData();
  const [planCreateOpen, setPlanCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activePlan = pickActivePlan(plans);
  const activeCycle = pickActiveCycle(cycles, units, activePlan);
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const resolvedStorage = useMemo(() => resolveStorage(storage), [storage]);
  const [width, setWidth] = useState<number>(() =>
    readStoredWidth(resolvedStorage),
  );
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    readStoredCollapsed(resolvedStorage),
  );
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    setWidth(clampWidth(drag.startWidth + delta));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setWidth((w) => {
      writeStoredWidth(resolvedStorage, w);
      return w;
    });
  }, [onPointerMove, resolvedStorage]);

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: width };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(resolvedStorage, next);
      return next;
    });
  }, [resolvedStorage]);

  if (collapsed) {
    return (
      <AppShell.Sidebar
        data-testid="app-sidebar"
        data-collapsed="true"
        data-width={COLLAPSED_WIDTH}
        className="relative overflow-visible"
        style={{ width: `${COLLAPSED_WIDTH}px` }}
      >
        <div className="h-12 shrink-0 flex items-center justify-center border-b border-border">
          <button
            type="button"
            data-testid="sidebar-expand"
            onClick={toggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="p-1 text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <BrandMark size={20} />
          </button>
        </div>
        <nav
          aria-label="Projects"
          className="flex-1 overflow-y-auto py-2 space-y-1"
        >
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProject(p.id)}
              title={p.name}
              className={cn(
                "w-full flex justify-center py-2 transition-colors cursor-pointer",
                activeProjectId === p.id
                  ? "text-primary bg-primary/15"
                  : "text-muted hover:text-foreground hover:bg-surface-high",
              )}
            >
              <span className="text-xs font-bold">
                {p.name.charAt(0).toUpperCase()}
              </span>
            </button>
          ))}
        </nav>
      </AppShell.Sidebar>
    );
  }

  return (
    <AppShell.Sidebar
      data-testid="app-sidebar"
      data-width={width}
      className="relative overflow-visible"
      style={{ width: `${width}px` }}
    >
      <header
        className={cn(
          "shrink-0",
          "flex flex-col",
          "border-b border-border",
        )}
      >
        <div className="h-12 shrink-0 flex items-center gap-2 px-3">
          <BrandMark size={24} className="shrink-0" />
          <span
            data-testid="sidebar-brand-name"
            className="shrink-0 text-body-sm font-semibold text-foreground"
          >
            Clawket
          </span>
          <span className="flex-1" />
          <span className="shrink-0 text-label-sm text-muted">v3.0</span>
          <button
            type="button"
            data-testid="sidebar-collapse"
            onClick={toggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="shrink-0 text-label-sm text-muted hover:text-foreground transition-colors cursor-pointer px-1"
          >
            {"◀"}
          </button>
        </div>
        <div className="h-10 shrink-0 flex items-center gap-1 px-3 pb-2">
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProjectId}
            onSelect={setActiveProject}
            onCreateProject={createProject}
          />
          {activeProject && (
            <button
              type="button"
              data-testid="sidebar-project-settings"
              onClick={() => setSettingsOpen(true)}
              title="Project settings"
              aria-label="Project settings"
              className="shrink-0 text-label-sm text-muted hover:text-foreground transition-colors cursor-pointer px-1"
            >
              ⚙
            </button>
          )}
        </div>
      </header>
      <section
        className="flex flex-col gap-1 border-b border-border px-4 py-3"
        aria-label="Active context"
      >
        <p className="text-label-sm uppercase tracking-wide text-muted">
          Active
        </p>
        {activePlan ? (
          <>
            <p
              data-testid="sidebar-active-plan"
              className="text-body-sm font-medium text-foreground truncate"
            >
              {activePlan.title}
            </p>
            <p
              data-testid="sidebar-active-cycle"
              className="text-label-sm text-muted truncate"
            >
              {activeCycle ? `Cycle: ${activeCycle.title}` : "No active cycle"}
            </p>
          </>
        ) : (
          <p
            data-testid="sidebar-active-plan"
            className="text-body-sm text-muted italic"
          >
            No active plan
          </p>
        )}
      </section>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-label-sm uppercase tracking-wide text-muted">
            Plans
          </span>
          {nodes.length > 0 && (
            <span
              data-testid="sidebar-plan-count"
              className="text-label-sm text-muted tabular-nums"
            >
              {nodes.length}
            </span>
          )}
        </div>
        {activeProjectId && (
          <button
            type="button"
            data-testid="sidebar-new-plan"
            onClick={() => setPlanCreateOpen(true)}
            className={cn(
              "text-label-sm font-medium text-primary",
              "hover:underline focus:outline-none focus-visible:underline",
            )}
          >
            + New plan
          </button>
        )}
      </div>
      <nav
        aria-label="Plan tree"
        className="min-h-0 flex-1 overflow-auto px-2 py-3"
      >
        {nodes.length === 0 ? (
          <div
            data-testid="sidebar-plans-empty"
            className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center"
          >
            <p className="text-body-sm font-medium text-foreground">
              No plans yet
            </p>
            <p className="text-label-sm text-muted">
              Create a plan to get started
            </p>
            {activeProjectId && (
              <button
                type="button"
                data-testid="sidebar-empty-new-plan"
                onClick={() => setPlanCreateOpen(true)}
                className={cn(
                  "mt-1 text-label-sm font-medium text-primary",
                  "hover:underline focus:outline-none focus-visible:underline",
                )}
              >
                + New plan
              </button>
            )}
          </div>
        ) : (
          <PlanTree
            nodes={nodes}
            activeId={activeId ?? undefined}
            onSelect={onSelect}
            onApprovePlan={async (node) => {
              try {
                await approvePlan(node.id);
              } catch (err) {
                console.error("approvePlan failed:", err);
              }
            }}
          />
        )}
      </nav>
      {planCreateOpen && activeProjectId && (
        <PlanCreateModal
          projectId={activeProjectId}
          onClose={() => setPlanCreateOpen(false)}
          onSubmit={async (input) => {
            await createPlan(input);
            setPlanCreateOpen(false);
          }}
        />
      )}
      {settingsOpen && activeProject && (
        <ProjectSettingsModal
          project={activeProject}
          onClose={() => setSettingsOpen(false)}
          onSubmit={async (patch) => {
            await updateProject(activeProject.id, patch);
            setSettingsOpen(false);
          }}
        />
      )}
      <div
        data-testid="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onHandlePointerDown}
        className={cn(
          "absolute right-0 top-0 h-full w-1.5 translate-x-1/2 z-10",
          "cursor-col-resize",
          "hover:bg-primary/40",
        )}
      />
    </AppShell.Sidebar>
  );
}
