import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PlanTreeNode } from "@clawket/ui";

/**
 * `PlanTreeNode["kind"]` is "plan" | "unit" | "task" (the tree's row types).
 * Cycles are not tree rows — they cut across units — but the DetailDrawer can
 * still surface a CycleDetail panel when triggered from UnitDetail. Widen the
 * selection kind here without touching the UI package.
 */
export type SelectableKind = PlanTreeNode["kind"] | "cycle";
export type SelectedKind = SelectableKind | null;

interface SelectionState {
  selectedId: string | null;
  selectedKind: SelectedKind;
  select: (id: string, kind: SelectableKind) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<SelectedKind>(null);
  const value = useMemo<SelectionState>(
    () => ({
      selectedId,
      selectedKind,
      select(id, kind) {
        setSelectedId(id);
        setSelectedKind(kind);
      },
      clear() {
        setSelectedId(null);
        setSelectedKind(null);
      },
    }),
    [selectedId, selectedKind],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionState {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelection must be used inside <SelectionProvider>");
  }
  return ctx;
}

/**
 * Clears the active selection whenever `projectId` transitions to a different
 * value than previously observed. Skips the very first observed value so the
 * initial `null → loaded` transition does not fire a redundant clear (the
 * selection is already null at mount).
 *
 * B2: the previously selected entity belongs to the old project and must not
 * stay open in the DetailDrawer when the user switches projects.
 */
export function useClearSelectionOnProjectChange(
  projectId: string | null,
): void {
  const { clear } = useSelection();
  const lastRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastRef.current === undefined) {
      lastRef.current = projectId;
      return;
    }
    if (lastRef.current === projectId) return;
    lastRef.current = projectId;
    clear();
  }, [projectId, clear]);
}
