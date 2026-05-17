import { useMemo, useState } from "react";
import {
  AppShell,
  CommandSurface,
  type CommandItem,
  type PlanTreeNode,
} from "@clawket/ui";
import { Sidebar } from "./shell/Sidebar";
import { Topbar } from "./shell/Topbar";
import { DetailDrawer } from "./shell/DetailDrawer";
import ToastContainer from "./shell/Toast";
import HelpModal from "./shell/HelpModal";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useDaemonHealth } from "./hooks/useDaemonHealth";
import { toastError, toastSuccess } from "./lib/toast";
import { VIEWS, type ViewId } from "./shell/views";
import {
  SelectionProvider,
  useClearSelectionOnProjectChange,
  useSelection,
} from "./shell/selection";
import { renderView } from "./views";
import { DataProvider, useData } from "./data/DataProvider";
import type { DaemonClient } from "./data/api";
import { buildPlanTreeFromData } from "./data/planTree";

// First-run fallback. After mount, the active project is loaded from
// localStorage (key `clawket.activeProjectId`) and from the daemon's
// /projects list. This constant only matters when neither yields a value.
const DEFAULT_PROJECT_ID = "PROJ-lattice-mono";

function AppInner() {
  const [activeView, setActiveView] = useState<ViewId>("summary");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  useGlobalShortcuts({
    onPalette: () => setPaletteOpen(true),
    onHelp: () => setHelpOpen(true),
  });
  const { selectedId, select } = useSelection();
  const { plans, units, tasks, activeProjectId, refresh } = useData();
  useClearSelectionOnProjectChange(activeProjectId);

  const { connected: daemonHealthy, reconnect: pollHealth } = useDaemonHealth({
    onStatusChange: (ok) => {
      if (!ok) toastError("Daemon disconnected. Trying to reconnect…");
      else toastSuccess("Daemon reconnected.");
    },
  });

  function handleReconnect() {
    pollHealth();
    void refresh();
  }

  const planTreeNodes = useMemo(
    () => buildPlanTreeFromData(plans, units, tasks),
    [plans, units, tasks],
  );

  const commandItems = useMemo<CommandItem[]>(() => {
    const viewItems: CommandItem[] = VIEWS.map((v, idx) => ({
      id: `view:${v.id}`,
      label: `Open ${v.label} view`,
      hint: `⌘${idx + 1}`,
      group: "Views",
    }));
    const planItems: CommandItem[] = plans.map((p) => ({
      id: `plan:${p.id}`,
      label: p.title,
      hint: p.status,
      group: "Plans",
    }));
    const unitItems: CommandItem[] = units.map((u) => ({
      id: `unit:${u.id}`,
      label: u.title,
      group: "Units",
    }));
    const taskItems: CommandItem[] = tasks.map((t) => ({
      id: `task:${t.id}`,
      ticket: t.ticket_number ?? t.id,
      label: t.title,
      hint: t.status,
      group: "Tasks",
    }));
    const all = [...viewItems, ...planItems, ...unitItems, ...taskItems];
    const q = paletteQuery.trim().toLowerCase();
    if (!q) {
      // Unfiltered: cap heavy groups to keep the palette scannable. With an
      // active query the filter naturally limits the result count.
      return [
        ...viewItems,
        ...planItems.slice(0, 8),
        ...unitItems.slice(0, 8),
        ...taskItems.slice(0, 12),
      ];
    }
    return all.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.ticket?.toLowerCase().includes(q),
    );
  }, [paletteQuery, plans, units, tasks]);

  function handlePaletteSelect(item: CommandItem) {
    if (item.id.startsWith("view:")) {
      setActiveView(item.id.slice("view:".length) as ViewId);
    } else if (item.id.startsWith("task:")) {
      select(item.id.slice("task:".length), "task");
    } else if (item.id.startsWith("plan:")) {
      select(item.id.slice("plan:".length), "plan");
    } else if (item.id.startsWith("unit:")) {
      select(item.id.slice("unit:".length), "unit");
    }
    // Cycles are listed for jump-to-view purposes but PlanTreeNodeKind does
    // not yet include "cycle"; cycle navigation lives behind U-F (Cycle
    // mutations) once the selection type grows a cycle case.
    setPaletteOpen(false);
    setPaletteQuery("");
  }

  function handleTreeSelect(node: PlanTreeNode) {
    select(node.id, node.kind);
  }

  return (
    <AppShell.Root>
      <Sidebar
        nodes={planTreeNodes}
        activeId={selectedId}
        onSelect={handleTreeSelect}
      />
      <AppShell.Content>
        <Topbar
          activeView={activeView}
          onViewChange={setActiveView}
          onOpenPalette={() => setPaletteOpen(true)}
          daemonHealthy={daemonHealthy}
          onReconnect={handleReconnect}
        />
        <AppShell.Main>{renderView(activeView)}</AppShell.Main>
      </AppShell.Content>
      <DetailDrawer />
      <CommandSurface
        open={paletteOpen}
        items={commandItems}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        onSelect={handlePaletteSelect}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteQuery("");
        }}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastContainer />
    </AppShell.Root>
  );
}

export interface AppProps {
  /** Injected DaemonClient for tests. Falls back to the singleton client. */
  client?: DaemonClient;
  /** Disable SSE for tests / offline mode. */
  disableSse?: boolean;
  /** Override the default project id (used as a fallback only). */
  projectId?: string;
}

export default function App({ client, disableSse, projectId }: AppProps = {}) {
  return (
    <DataProvider
      projectId={projectId ?? DEFAULT_PROJECT_ID}
      client={client}
      disableSse={disableSse}
    >
      <SelectionProvider>
        <AppInner />
      </SelectionProvider>
    </DataProvider>
  );
}
