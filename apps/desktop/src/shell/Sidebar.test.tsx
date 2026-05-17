import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  Sidebar,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "./Sidebar";
import { DataProvider } from "../data/DataProvider";
import type { DaemonClient } from "../data/api";

function seededClient(): DaemonClient {
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
    listPlans: vi.fn(async () => []),
    listUnits: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    updateProject: vi.fn(async (_id, _patch) => ({
      id: "PROJ-1",
      name: "Test Project",
      description: null,
      key: null,
      enabled: 1,
      wiki_paths: [],
      cwds: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    getPlan: vi.fn(),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
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

function renderWith(storage?: Storage | null) {
  return render(
    <DataProvider projectId="PROJ-1" client={seededClient()} disableSse>
      <Sidebar
        nodes={[]}
        activeId={null}
        onSelect={() => {}}
        storage={storage}
      />
    </DataProvider>,
  );
}

describe("Sidebar resize", () => {
  it("uses the default width (288) when no value is stored", () => {
    renderWith(memoryStorage());
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-width",
      "288",
    );
  });

  it("hydrates the width from storage on mount", () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "240");
    renderWith(storage);
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-width",
      "240",
    );
  });

  it("clamps a stored width below the minimum (200)", () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "50");
    renderWith(storage);
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-width",
      "200",
    );
  });

  it("clamps a stored width above the maximum (480)", () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "9999");
    renderWith(storage);
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-width",
      "480",
    );
  });

  it("exposes a resize handle with role=separator", () => {
    renderWith(memoryStorage());
    const handle = screen.getByTestId("sidebar-resize-handle");
    expect(handle).toHaveAttribute("role", "separator");
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
  });

  it("applies width as an inline style", () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "320");
    renderWith(storage);
    const sidebar = screen.getByTestId("app-sidebar");
    expect(sidebar.style.width).toBe("320px");
  });
});

describe("Sidebar branding", () => {
  it("renders the Clawket brand mark and product name in the header", () => {
    renderWith(memoryStorage());
    expect(screen.getByTestId("brand-mark")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-brand-name")).toHaveTextContent(
      "Clawket",
    );
  });
});

describe("Sidebar project settings", () => {
  it("renders a ⚙ project settings button next to the project switcher", async () => {
    renderWith(memoryStorage());
    const btn = await screen.findByTestId("sidebar-project-settings");
    expect(btn).toHaveAttribute("aria-label", "Project settings");
    expect(btn).toHaveTextContent("⚙");
  });

  it("opens the ProjectSettingsModal when the ⚙ button is clicked", async () => {
    renderWith(memoryStorage());
    const user = userEvent.setup();
    const btn = await screen.findByTestId("sidebar-project-settings");
    await user.click(btn);
    expect(
      await screen.findByTestId("project-settings-modal"),
    ).toBeInTheDocument();
  });
});

describe("Sidebar collapse", () => {
  it("renders a ◀ collapse button in the brand row", () => {
    renderWith(memoryStorage());
    const btn = screen.getByTestId("sidebar-collapse");
    expect(btn).toHaveAttribute("aria-label", "Collapse sidebar");
    expect(btn).toHaveTextContent("◀");
  });

  it("collapses to 48px when the ◀ button is clicked and persists the state", async () => {
    const storage = memoryStorage();
    renderWith(storage);
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByTestId("sidebar-collapse"));
    });
    const sidebar = screen.getByTestId("app-sidebar");
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar.style.width).toBe("48px");
    expect(storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(screen.getByTestId("sidebar-expand")).toBeInTheDocument();
  });

  it("hydrates the collapsed state from storage on mount", async () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    renderWith(storage);
    await waitFor(() => {
      expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
        "data-collapsed",
        "true",
      );
    });
  });

  it("expands back to the stored width when the brand button is clicked while collapsed", async () => {
    const storage = memoryStorage();
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "320");
    renderWith(storage);
    const user = userEvent.setup();
    const expand = await screen.findByTestId("sidebar-expand");
    await act(async () => {
      await user.click(expand);
    });
    const sidebar = screen.getByTestId("app-sidebar");
    expect(sidebar).not.toHaveAttribute("data-collapsed");
    expect(sidebar.style.width).toBe("320px");
  });
});

describe("Sidebar plans empty state", () => {
  it("renders an empty-state CTA when there are no plans", async () => {
    renderWith();
    const empty = await screen.findByTestId("sidebar-plans-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent("No plans yet");
    expect(empty).toHaveTextContent("Create a plan to get started");
    expect(screen.getByTestId("sidebar-empty-new-plan")).toBeInTheDocument();
  });

  it("hides the plan-count chip when there are no plans", async () => {
    renderWith();
    await screen.findByTestId("sidebar-plans-empty");
    expect(screen.queryByTestId("sidebar-plan-count")).toBeNull();
  });

  it("renders the plan-count chip when nodes are present", () => {
    render(
      <DataProvider projectId="PROJ-1" client={seededClient()} disableSse>
        <Sidebar
          nodes={[
            { id: "p1", kind: "plan", label: "First", planStatus: "active" },
            { id: "p2", kind: "plan", label: "Second", planStatus: "draft" },
          ]}
          activeId={null}
          onSelect={() => {}}
          storage={null}
        />
      </DataProvider>,
    );
    expect(screen.getByTestId("sidebar-plan-count")).toHaveTextContent("2");
  });
});
