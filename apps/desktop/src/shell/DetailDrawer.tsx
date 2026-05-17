import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, cn } from "@clawket/ui";
import { useSelection } from "./selection";
import { useData } from "../data/DataProvider";
import {
  DetailPanels,
  detailSubtitle,
  resolveDetailSelection,
} from "./DetailPanels";

export const DRAWER_WIDTH_STORAGE_KEY = "clawket.drawerWidth";
const MIN_WIDTH = 320;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 400;

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
    const raw = storage.getItem(DRAWER_WIDTH_STORAGE_KEY);
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
    storage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

interface DetailDrawerProps {
  storage?: Storage | null;
}

export function DetailDrawer({ storage }: DetailDrawerProps = {}) {
  const { selectedId, selectedKind, clear, select } = useSelection();
  const {
    status,
    activeProjectId,
    plans,
    units,
    cycles,
    tasks,
    approvePlan,
    completePlan,
    updatePlan,
    createUnit,
    updateUnit,
    deleteUnit,
    createCycle,
    updateCycle,
    activateCycle,
    completeCycle,
    deleteCycle,
    updateTask,
    deleteTask,
    createSubtask,
    decomposeTask,
    listTaskComments,
    createTaskComment,
    deleteTaskComment,
    listTaskQuestions,
    createTaskQuestion,
    answerTaskQuestion,
    listTaskRuns,
  } = useData();
  const resolvedStorage = useMemo(() => resolveStorage(storage), [storage]);

  const [width, setWidth] = useState<number>(() =>
    readStoredWidth(resolvedStorage),
  );
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const resolved = resolveDetailSelection(
    selectedKind,
    selectedId,
    plans,
    units,
    tasks,
    cycles,
  );
  const open = status === "ready" && resolved !== null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        clear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, clear]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const delta = drag.startX - e.clientX;
    const next = clampWidth(drag.startWidth + delta);
    setWidth(next);
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

  const subtitle = detailSubtitle(resolved);

  return (
    <aside
      data-testid="detail-drawer"
      data-open={open || undefined}
      data-width={width}
      role="complementary"
      aria-label="Detail panel"
      aria-hidden={!open}
      style={{ width: `${width}px` }}
      className={cn(
        "fixed right-0 top-0 z-30 h-screen",
        "border-l border-border bg-surface shadow-2xl",
        "flex",
        "transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      <div
        data-testid="detail-drawer-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail panel"
        onPointerDown={onHandlePointerDown}
        className={cn(
          "absolute left-0 top-0 h-full w-1.5 -translate-x-1/2",
          "cursor-col-resize",
          "hover:bg-primary/40",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "h-12 shrink-0",
            "flex items-center justify-between gap-2",
            "border-b border-border",
            "px-3",
          )}
        >
          <div className="min-w-0 flex flex-col leading-tight">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Detail
            </span>
            {subtitle && (
              <span
                data-testid="detail-drawer-subtitle"
                className="truncate text-body-sm text-foreground"
              >
                {subtitle}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            data-testid="detail-drawer-close"
            aria-label="Close detail panel"
          >
            ✕
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          {open ? (
            <DetailPanels
              selectedKind={selectedKind}
              selectedId={selectedId}
              plans={plans}
              units={units}
              tasks={tasks}
              cycles={cycles}
              activeProjectId={activeProjectId}
              onApprovePlan={approvePlan}
              onCompletePlan={completePlan}
              onUpdatePlan={updatePlan}
              onCreateUnit={createUnit}
              onUpdateUnit={updateUnit}
              onDeleteUnit={deleteUnit}
              onCreateCycle={createCycle}
              onUpdateCycle={updateCycle}
              onActivateCycle={activateCycle}
              onCompleteCycle={completeCycle}
              onDeleteCycle={deleteCycle}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onCreateSubtask={createSubtask}
              onDecomposeTask={decomposeTask}
              onListComments={listTaskComments}
              onCreateComment={createTaskComment}
              onDeleteComment={deleteTaskComment}
              onListQuestions={listTaskQuestions}
              onCreateQuestion={createTaskQuestion}
              onAnswerQuestion={answerTaskQuestion}
              onListRuns={listTaskRuns}
              onSelectUnit={(id) => select(id, "unit")}
              onSelectCycle={(id) => select(id, "cycle")}
              onSelectTask={(id) => select(id, "task")}
              onSelectItem={(item) => select(item.id, item.type)}
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
