import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataProvider, __test, useData } from "./DataProvider";
import type { DaemonClient } from "./api";
import type {
  Cycle,
  Knowledge,
  Plan,
  Project,
  Task,
  TimelineEvent,
  Unit,
} from "./types";

const { reducer, INITIAL, pickActiveProjectId, ACTIVE_PROJECT_STORAGE_KEY } =
  __test;

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: "PROJ-1",
    name: "Project One",
    description: null,
    key: null,
    enabled: 1,
    wiki_paths: [],
    cwds: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function mockClient(
  overrides: Partial<DaemonClient> = {},
): DaemonClient {
  return {
    listProjects: vi.fn(async () => [makeProject()]),
    listPlans: vi.fn(async () => []),
    listUnits: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    getPlan: vi.fn(async () => ({}) as Plan),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
    ...overrides,
  } as unknown as DaemonClient;
}

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    /** Test helper: expose the backing map. */
    _store: store,
  };
}

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = FakeEventSource.CONNECTING;
  private listeners = new Map<string, Set<EventListener>>();
  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, cb: EventListener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(cb);
  }
  removeEventListener(name: string, cb: EventListener) {
    this.listeners.get(name)?.delete(cb);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  fire(name: string, data?: unknown, lastEventId?: string) {
    const ev = new MessageEvent(name, {
      data: data === undefined ? "" : JSON.stringify(data),
      lastEventId: lastEventId ?? "",
    });
    this.listeners.get(name)?.forEach((cb) => cb(ev));
  }
  fireOpen() {
    this.readyState = FakeEventSource.OPEN;
    this.listeners.get("open")?.forEach((cb) => cb(new Event("open")));
  }
}

describe("reducer", () => {
  it("INIT_START sets loading", () => {
    expect(reducer(INITIAL, { type: "INIT_START" })).toMatchObject({
      status: "loading",
      error: null,
    });
  });

  it("INIT_LOADED populates all collections and clears error", () => {
    const r = reducer(
      { ...INITIAL, status: "error", error: "boom" },
      {
        type: "INIT_LOADED",
        projects: [makeProject({ id: "PROJ-1" })],
        activeProjectId: "PROJ-1",
        plans: [{ id: "PLAN-1" } as Plan],
        units: [{ id: "UNIT-1" } as Unit],
        cycles: [{ id: "CYC-1" } as Cycle],
        tasks: [{ id: "TASK-1" } as Task],
        knowledge: [{ id: "ART-1" } as Knowledge],
        timeline: [{ id: "EV-1" } as unknown as TimelineEvent],
        wikiFiles: [],
        runs: [],
      },
    );
    expect(r.status).toBe("ready");
    expect(r.error).toBeNull();
    expect(r.projects).toHaveLength(1);
    expect(r.activeProjectId).toBe("PROJ-1");
    expect(r.plans).toHaveLength(1);
    expect(r.tasks[0]!.id).toBe("TASK-1");
  });

  it("SET_ACTIVE_PROJECT only mutates activeProjectId", () => {
    const seeded = {
      ...INITIAL,
      activeProjectId: "PROJ-1",
      plans: [{ id: "PLAN-1" } as Plan],
    };
    const r = reducer(seeded, { type: "SET_ACTIVE_PROJECT", id: "PROJ-2" });
    expect(r.activeProjectId).toBe("PROJ-2");
    expect(r.plans).toHaveLength(1);
  });

  it("INIT_ERROR retains existing collections", () => {
    const r = reducer(
      { ...INITIAL, plans: [{ id: "PLAN-X" } as Plan] },
      { type: "INIT_ERROR", message: "network down" },
    );
    expect(r.status).toBe("error");
    expect(r.error).toBe("network down");
    expect(r.plans).toHaveLength(1);
  });

  it("REMOVE drops the entity from the right collection", () => {
    const seeded = {
      ...INITIAL,
      tasks: [
        { id: "TASK-1" } as Task,
        { id: "TASK-2" } as Task,
      ],
    };
    expect(
      reducer(seeded, { type: "REMOVE", entity: "task", id: "TASK-1" })
        .tasks,
    ).toEqual([{ id: "TASK-2" }]);
  });

  it("UPSERT_TASKS replaces the list (full reload semantics)", () => {
    const r = reducer(INITIAL, {
      type: "UPSERT_TASKS",
      items: [{ id: "TASK-9" } as Task],
    });
    expect(r.tasks).toEqual([{ id: "TASK-9" }]);
  });
});

describe("pickActiveProjectId", () => {
  it("returns null for empty list", () => {
    expect(pickActiveProjectId([], null, undefined)).toBeNull();
  });

  it("honours preferred id when present", () => {
    const projects = [
      makeProject({ id: "PROJ-1" }),
      makeProject({ id: "PROJ-2" }),
    ];
    expect(pickActiveProjectId(projects, "PROJ-2", undefined)).toBe("PROJ-2");
  });

  it("falls through to fallback default when preferred is gone", () => {
    const projects = [makeProject({ id: "PROJ-2" })];
    expect(pickActiveProjectId(projects, "PROJ-1", "PROJ-2")).toBe("PROJ-2");
  });

  it("falls through to first enabled when both preferred and default are gone", () => {
    const projects = [
      makeProject({ id: "PROJ-A", enabled: 0 }),
      makeProject({ id: "PROJ-B", enabled: 1 }),
    ];
    expect(pickActiveProjectId(projects, "PROJ-Missing", "PROJ-Missing")).toBe(
      "PROJ-B",
    );
  });

  it("falls back to first project if none are enabled", () => {
    const projects = [
      makeProject({ id: "PROJ-A", enabled: 0 }),
      makeProject({ id: "PROJ-B", enabled: 0 }),
    ];
    expect(pickActiveProjectId(projects, null, undefined)).toBe("PROJ-A");
  });
});

describe("DataProvider", () => {
  it("fires parallel initial fetches and transitions to ready", async () => {
    const client = mockClient({
      listProjects: vi.fn(async () => [makeProject({ id: "PROJ-1" })]),
      listPlans: vi.fn(async () => [{ id: "PLAN-1" } as Plan]),
      listTasks: vi.fn(async () => [
        { id: "TASK-1" } as Task,
        { id: "TASK-2" } as Task,
      ]),
      listTimeline: vi.fn(async () => [
        { id: "EV-1" } as unknown as TimelineEvent,
      ]),
    });

    const storage = memoryStorage();
    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={storage}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(client.listProjects).toHaveBeenCalledTimes(1);
    expect(client.listPlans).toHaveBeenCalledWith("PROJ-1");
    expect(client.listUnits).toHaveBeenCalledTimes(1);
    expect(client.listCycles).toHaveBeenCalledWith({ projectId: "PROJ-1" });
    expect(client.listTimeline).toHaveBeenCalledWith("PROJ-1", { limit: 200 });
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.activeProjectId).toBe("PROJ-1");
    expect(result.current.plans).toHaveLength(1);
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.timeline).toHaveLength(1);
    // Persisted active project on first load.
    expect(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe("PROJ-1");
  });

  it("setActiveProject switches the project scope and refetches", async () => {
    const projects = [
      makeProject({ id: "PROJ-1" }),
      makeProject({ id: "PROJ-2", name: "Project Two" }),
    ];
    const planLists: Record<string, Plan[]> = {
      "PROJ-1": [{ id: "PLAN-A" } as Plan],
      "PROJ-2": [{ id: "PLAN-B" } as Plan, { id: "PLAN-C" } as Plan],
    };
    const client = mockClient({
      listProjects: vi.fn(async () => projects),
      listPlans: vi.fn(async (pid?: string) =>
        pid ? planLists[pid] ?? [] : [],
      ),
    });
    const storage = memoryStorage();

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={storage}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.activeProjectId).toBe("PROJ-1");
    expect(result.current.plans.map((p) => p.id)).toEqual(["PLAN-A"]);

    act(() => result.current.setActiveProject("PROJ-2"));
    await waitFor(() => {
      expect(result.current.activeProjectId).toBe("PROJ-2");
    });
    await waitFor(() => {
      expect(result.current.plans.map((p) => p.id)).toEqual([
        "PLAN-B",
        "PLAN-C",
      ]);
    });
    expect(client.listPlans).toHaveBeenCalledWith("PROJ-2");
    expect(client.listCycles).toHaveBeenCalledWith({ projectId: "PROJ-2" });
    expect(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe("PROJ-2");
  });

  it("honours a persisted active project on mount", async () => {
    const projects = [
      makeProject({ id: "PROJ-1" }),
      makeProject({ id: "PROJ-2", name: "Project Two" }),
    ];
    const client = mockClient({
      listProjects: vi.fn(async () => projects),
    });
    const storage = memoryStorage();
    storage.setItem(ACTIVE_PROJECT_STORAGE_KEY, "PROJ-2");

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={storage}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.activeProjectId).toBe("PROJ-2");
    expect(client.listPlans).toHaveBeenCalledWith("PROJ-2");
  });

  it("falls into error status when any initial fetch rejects", async () => {
    const client = mockClient({
      listTasks: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider projectId="PROJ-1" client={client} disableSse>
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/boom/);
  });

  it("refetches the affected entity list on a non-deleted SSE event", async () => {
    FakeEventSource.instances = [];
    const taskListA = [{ id: "TASK-1" } as Task];
    const taskListB = [
      { id: "TASK-1" } as Task,
      { id: "TASK-2" } as Task,
    ];
    let taskCallCount = 0;
    const client = mockClient({
      listTasks: vi.fn(async () => {
        taskCallCount += 1;
        return taskCallCount === 1 ? taskListA : taskListB;
      }),
    });

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          eventSourceImpl={FakeEventSource as unknown as typeof EventSource}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());
    act(() => es.fire("task:updated", { id: "TASK-2" }, "99"));

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(2);
    });
    expect(client.listTasks).toHaveBeenCalledTimes(2);
  });

  it("removes the entity locally on a *:deleted SSE event (no refetch)", async () => {
    FakeEventSource.instances = [];
    const client = mockClient({
      listKnowledge: vi.fn(async () => [
        { id: "ART-1" } as Knowledge,
        { id: "ART-2" } as Knowledge,
      ]),
    });

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          eventSourceImpl={FakeEventSource as unknown as typeof EventSource}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.knowledge).toHaveLength(2));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());

    const initialCalls = (client.listKnowledge as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => es.fire("knowledge:deleted", { id: "ART-1" }, "100"));

    await waitFor(() => {
      expect(result.current.knowledge.map((k) => k.id)).toEqual(["ART-2"]);
    });
    // No extra refetch was issued for the delete path.
    expect(
      (client.listKnowledge as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(initialCalls);
  });

  it("mirrors SSE readyState into context.sse", async () => {
    FakeEventSource.instances = [];
    const client = mockClient();
    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          eventSourceImpl={FakeEventSource as unknown as typeof EventSource}
        >
          {children}
        </DataProvider>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());

    await waitFor(() => {
      expect(result.current.sse.readyState).toBe("open");
    });
  });

  it("throws if useData is used outside DataProvider", () => {
    const { result } = renderHook(() => {
      try {
        return useData();
      } catch (e) {
        return { error: (e as Error).message };
      }
    });
    expect((result.current as { error: string }).error).toMatch(
      /must be used inside <DataProvider>/,
    );
  });

  it("renders children while initial fetch resolves", async () => {
    const client = mockClient();
    const { getByTestId } = render(
      <DataProvider client={client} disableSse>
        <div data-testid="child">hello</div>
      </DataProvider>,
    );
    expect(getByTestId("child").textContent).toBe("hello");
    // Let the in-flight fetchAll resolve so the test exits cleanly.
    await waitFor(() => expect(client.listPlans).toHaveBeenCalled());
  });

  it("createPlan() calls daemon and refetches the plan list", async () => {
    const created = { id: "PLAN-NEW", title: "New" } as Plan;
    const after = [{ id: "PLAN-NEW" } as Plan];
    const listPlans = vi
      .fn<(pid?: string) => Promise<Plan[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue(after);
    const client = mockClient({
      listPlans,
      createPlan: vi.fn(async () => created),
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const r = await result.current.createPlan({
        projectId: "PROJ-1",
        title: "New",
      });
      expect(r).toEqual(created);
    });
    // First call from init, second from refetch after mutation.
    expect(listPlans).toHaveBeenCalledTimes(2);
    expect(listPlans).toHaveBeenLastCalledWith("PROJ-1");
    await waitFor(() =>
      expect(result.current.plans.map((p) => p.id)).toEqual(["PLAN-NEW"]),
    );
  });

  it("updatePlan() PATCHes and refetches", async () => {
    const updated = { id: "PLAN-1", title: "Renamed" } as Plan;
    const listPlans = vi
      .fn<(pid?: string) => Promise<Plan[]>>()
      .mockResolvedValueOnce([{ id: "PLAN-1", title: "Old" } as Plan])
      .mockResolvedValue([updated]);
    const updatePlan = vi.fn(async () => updated);
    const client = mockClient({
      listPlans,
      updatePlan,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.updatePlan("PLAN-1", { title: "Renamed" });
    });
    expect(updatePlan).toHaveBeenCalledWith("PLAN-1", { title: "Renamed" });
    await waitFor(() =>
      expect(result.current.plans[0]!.title).toBe("Renamed"),
    );
  });

  it("approvePlan() POSTs the approve endpoint and refetches", async () => {
    const after = [
      { id: "PLAN-1", status: "active" } as Plan,
    ];
    const listPlans = vi
      .fn<(pid?: string) => Promise<Plan[]>>()
      .mockResolvedValueOnce([{ id: "PLAN-1", status: "draft" } as Plan])
      .mockResolvedValue(after);
    const approvePlan = vi.fn(async () => after[0]!);
    const client = mockClient({
      listPlans,
      approvePlan,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.approvePlan("PLAN-1");
    });
    expect(approvePlan).toHaveBeenCalledWith("PLAN-1");
    await waitFor(() =>
      expect(result.current.plans[0]!.status).toBe("active"),
    );
  });

  it("completePlan() routes through updatePlan(status='completed')", async () => {
    const after = [{ id: "PLAN-1", status: "completed" } as Plan];
    const listPlans = vi
      .fn<(pid?: string) => Promise<Plan[]>>()
      .mockResolvedValueOnce([{ id: "PLAN-1", status: "active" } as Plan])
      .mockResolvedValue(after);
    const completePlan = vi.fn(async () => after[0]!);
    const client = mockClient({
      listPlans,
      completePlan,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.completePlan("PLAN-1");
    });
    expect(completePlan).toHaveBeenCalledWith("PLAN-1");
    await waitFor(() =>
      expect(result.current.plans[0]!.status).toBe("completed"),
    );
  });

  it("deletePlan() optimistically removes then refetches", async () => {
    const listPlans = vi
      .fn<(pid?: string) => Promise<Plan[]>>()
      .mockResolvedValueOnce([
        { id: "PLAN-1" } as Plan,
        { id: "PLAN-2" } as Plan,
      ])
      .mockResolvedValue([{ id: "PLAN-2" } as Plan]);
    const deletePlan = vi.fn(async () => ({ ok: true, deleted: "PLAN-1" }));
    const client = mockClient({
      listPlans,
      deletePlan,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.plans).toHaveLength(2);
    await act(async () => {
      await result.current.deletePlan("PLAN-1");
    });
    expect(deletePlan).toHaveBeenCalledWith("PLAN-1");
    await waitFor(() =>
      expect(result.current.plans.map((p) => p.id)).toEqual(["PLAN-2"]),
    );
  });

  it("createUnit() calls daemon and refetches via listUnits", async () => {
    const created = { id: "UNIT-NEW" } as Unit;
    const after = [{ id: "UNIT-NEW" } as Unit];
    const listUnits = vi
      .fn<() => Promise<Unit[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue(after);
    const createUnit = vi.fn(async () => created);
    const client = mockClient({
      listUnits,
      createUnit,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const r = await result.current.createUnit({
        planId: "PLAN-1",
        title: "U1",
      });
      expect(r).toEqual(created);
    });
    expect(createUnit).toHaveBeenCalledWith({ planId: "PLAN-1", title: "U1" });
    expect(listUnits).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.units.map((u) => u.id)).toEqual(["UNIT-NEW"]),
    );
  });

  it("updateUnit() PATCHes and refetches", async () => {
    const updated = { id: "UNIT-1", title: "Renamed" } as Unit;
    const listUnits = vi
      .fn<() => Promise<Unit[]>>()
      .mockResolvedValueOnce([{ id: "UNIT-1", title: "Old" } as Unit])
      .mockResolvedValue([updated]);
    const updateUnit = vi.fn(async () => updated);
    const client = mockClient({
      listUnits,
      updateUnit,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.updateUnit("UNIT-1", { title: "Renamed" });
    });
    expect(updateUnit).toHaveBeenCalledWith("UNIT-1", { title: "Renamed" });
    await waitFor(() =>
      expect(result.current.units[0]!.title).toBe("Renamed"),
    );
  });

  it("deleteUnit() optimistically removes then refetches", async () => {
    const listUnits = vi
      .fn<() => Promise<Unit[]>>()
      .mockResolvedValueOnce([
        { id: "UNIT-1" } as Unit,
        { id: "UNIT-2" } as Unit,
      ])
      .mockResolvedValue([{ id: "UNIT-2" } as Unit]);
    const deleteUnit = vi.fn(async () => ({ ok: true, deleted: "UNIT-1" }));
    const client = mockClient({
      listUnits,
      deleteUnit,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.units).toHaveLength(2);

    await act(async () => {
      await result.current.deleteUnit("UNIT-1");
    });
    expect(deleteUnit).toHaveBeenCalledWith("UNIT-1");
    await waitFor(() =>
      expect(result.current.units.map((u) => u.id)).toEqual(["UNIT-2"]),
    );
  });

  it("createCycle() calls daemon and refetches via listCycles with projectId", async () => {
    const created = { id: "CYC-NEW" } as Cycle;
    const after = [{ id: "CYC-NEW" } as Cycle];
    const listCycles = vi
      .fn<(opts?: { projectId?: string }) => Promise<Cycle[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue(after);
    const createCycle = vi.fn(async () => created);
    const client = mockClient({
      listCycles,
      createCycle,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const r = await result.current.createCycle({
        projectId: "PROJ-1",
        unitId: "UNIT-1",
        title: "C1",
      });
      expect(r).toEqual(created);
    });
    expect(createCycle).toHaveBeenCalledWith({
      projectId: "PROJ-1",
      unitId: "UNIT-1",
      title: "C1",
    });
    expect(listCycles).toHaveBeenCalledTimes(2);
    expect(listCycles).toHaveBeenLastCalledWith({ projectId: "PROJ-1" });
    await waitFor(() =>
      expect(result.current.cycles.map((c) => c.id)).toEqual(["CYC-NEW"]),
    );
  });

  it("updateCycle() PATCHes and refetches", async () => {
    const updated = { id: "CYC-1", title: "Renamed" } as Cycle;
    const listCycles = vi
      .fn<() => Promise<Cycle[]>>()
      .mockResolvedValueOnce([{ id: "CYC-1", title: "Old" } as Cycle])
      .mockResolvedValue([updated]);
    const updateCycle = vi.fn(async () => updated);
    const client = mockClient({
      listCycles,
      updateCycle,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.updateCycle("CYC-1", { title: "Renamed" });
    });
    expect(updateCycle).toHaveBeenCalledWith("CYC-1", { title: "Renamed" });
    await waitFor(() =>
      expect(result.current.cycles[0]!.title).toBe("Renamed"),
    );
  });

  it("activateCycle() POSTs the activate endpoint and refetches", async () => {
    const after = [{ id: "CYC-1", status: "active" } as Cycle];
    const listCycles = vi
      .fn<() => Promise<Cycle[]>>()
      .mockResolvedValueOnce([{ id: "CYC-1", status: "planning" } as Cycle])
      .mockResolvedValue(after);
    const activateCycle = vi.fn(async () => after[0]!);
    const client = mockClient({
      listCycles,
      activateCycle,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.activateCycle("CYC-1");
    });
    expect(activateCycle).toHaveBeenCalledWith("CYC-1");
    await waitFor(() =>
      expect(result.current.cycles[0]!.status).toBe("active"),
    );
  });

  it("completeCycle() POSTs the complete endpoint and refetches", async () => {
    const after = [{ id: "CYC-1", status: "completed" } as Cycle];
    const listCycles = vi
      .fn<() => Promise<Cycle[]>>()
      .mockResolvedValueOnce([{ id: "CYC-1", status: "active" } as Cycle])
      .mockResolvedValue(after);
    const completeCycle = vi.fn(async () => after[0]!);
    const client = mockClient({
      listCycles,
      completeCycle,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.completeCycle("CYC-1");
    });
    expect(completeCycle).toHaveBeenCalledWith("CYC-1");
    await waitFor(() =>
      expect(result.current.cycles[0]!.status).toBe("completed"),
    );
  });

  it("deleteCycle() optimistically removes then refetches", async () => {
    const listCycles = vi
      .fn<() => Promise<Cycle[]>>()
      .mockResolvedValueOnce([
        { id: "CYC-1" } as Cycle,
        { id: "CYC-2" } as Cycle,
      ])
      .mockResolvedValue([{ id: "CYC-2" } as Cycle]);
    const deleteCycle = vi.fn(async () => ({ ok: true, deleted: "CYC-1" }));
    const client = mockClient({
      listCycles,
      deleteCycle,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cycles).toHaveLength(2);

    await act(async () => {
      await result.current.deleteCycle("CYC-1");
    });
    expect(deleteCycle).toHaveBeenCalledWith("CYC-1");
    await waitFor(() =>
      expect(result.current.cycles.map((c) => c.id)).toEqual(["CYC-2"]),
    );
  });

  it("createTask() calls daemon and refetches tasks", async () => {
    const created = {
      id: "TASK-NEW",
      title: "New",
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
    } as Task;
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([created]);
    const createTask = vi.fn(async () => created);
    const client = mockClient({
      listTasks,
      createTask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const r = await result.current.createTask({
        unitId: "UNIT-1",
        cycleId: "CYC-1",
        title: "New",
      });
      expect(r).toEqual(created);
    });
    expect(createTask).toHaveBeenCalledWith({
      unitId: "UNIT-1",
      cycleId: "CYC-1",
      title: "New",
    });
    expect(listTasks).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.tasks.map((t) => t.id)).toEqual(["TASK-NEW"]),
    );
  });

  it("updateTask() forwards status+evidence and refetches", async () => {
    const before = {
      id: "TASK-1",
      title: "T",
      status: "in_progress",
    } as Task;
    const after = {
      id: "TASK-1",
      title: "T",
      status: "done",
      evidence: "shipped",
    } as Task;
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([before])
      .mockResolvedValue([after]);
    const updateTask = vi.fn(async () => after);
    const client = mockClient({
      listTasks,
      updateTask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.updateTask("TASK-1", {
        status: "done",
        evidence: "shipped",
      });
    });
    expect(updateTask).toHaveBeenCalledWith("TASK-1", {
      status: "done",
      evidence: "shipped",
    });
    await waitFor(() =>
      expect(result.current.tasks[0]!.status).toBe("done"),
    );
  });

  it("updateTask() propagates daemon EVIDENCE_REQUIRED error to caller", async () => {
    const before = {
      id: "TASK-1",
      status: "in_progress",
    } as Task;
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValue([before]);
    const err = new Error("evidence is required");
    Object.assign(err, { code: "EVIDENCE_REQUIRED", status: 400 });
    const updateTask = vi.fn(async () => {
      throw err;
    });
    const client = mockClient({
      listTasks,
      updateTask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await expect(
      result.current.updateTask("TASK-1", { status: "done" }),
    ).rejects.toThrow("evidence is required");
    // Reducer state unchanged on error.
    expect(result.current.tasks[0]!.status).toBe("in_progress");
  });

  it("deleteTask() optimistically removes then refetches (hard-delete path)", async () => {
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([
        { id: "TASK-1", status: "todo" } as Task,
        { id: "TASK-2", status: "todo" } as Task,
      ])
      .mockResolvedValue([{ id: "TASK-2", status: "todo" } as Task]);
    const deleteTask = vi.fn(async () => undefined);
    const client = mockClient({
      listTasks,
      deleteTask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.tasks).toHaveLength(2);

    await act(async () => {
      await result.current.deleteTask("TASK-1");
    });
    expect(deleteTask).toHaveBeenCalledWith("TASK-1", undefined);
    await waitFor(() =>
      expect(result.current.tasks.map((t) => t.id)).toEqual(["TASK-2"]),
    );
  });

  it("deleteTask() forwards reason and reflects cancelled state after refetch", async () => {
    const cancelled = {
      id: "TASK-1",
      status: "cancelled",
    } as Task;
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([{ id: "TASK-1", status: "in_progress" } as Task])
      .mockResolvedValue([cancelled]);
    const deleteTask = vi.fn(async () => undefined);
    const client = mockClient({
      listTasks,
      deleteTask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.deleteTask("TASK-1", { reason: "duplicate" });
    });
    expect(deleteTask).toHaveBeenCalledWith("TASK-1", { reason: "duplicate" });
    await waitFor(() =>
      expect(result.current.tasks[0]!.status).toBe("cancelled"),
    );
  });

  it("createSubtask() POSTs the daemon and refetches with the new child", async () => {
    const parent = {
      id: "TASK-P",
      parent_task_id: null,
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
      status: "in_progress",
    } as Task;
    const child = {
      id: "TASK-CHILD",
      parent_task_id: "TASK-P",
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
      status: "todo",
    } as Task;
    const listTasks = vi
      .fn<() => Promise<Task[]>>()
      .mockResolvedValueOnce([parent])
      .mockResolvedValue([parent, child]);
    const createSubtask = vi.fn(async () => child);
    const client = mockClient({
      listTasks,
      createSubtask,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const r = await result.current.createSubtask("TASK-P", {
        title: "Child",
      });
      expect(r).toEqual(child);
    });
    expect(createSubtask).toHaveBeenCalledWith("TASK-P", { title: "Child" });
    await waitFor(() =>
      expect(result.current.tasks.map((t) => t.id)).toEqual([
        "TASK-P",
        "TASK-CHILD",
      ]),
    );
  });

  it("listTaskComments() passes through to client.listComments", async () => {
    const listComments = vi.fn(async () => [
      {
        id: "CMT-1",
        task_id: "TASK-1",
        author: "main",
        body: "hi",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const client = mockClient({
      listComments,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const out = await result.current.listTaskComments("TASK-1");
    expect(listComments).toHaveBeenCalledWith("TASK-1");
    expect(out).toHaveLength(1);
  });

  it("createTaskComment() passes through to client.createComment", async () => {
    const createComment = vi.fn(async () => ({
      id: "CMT-NEW",
      task_id: "TASK-1",
      author: "main",
      body: "hello",
      created_at: "2026-01-01T00:00:00.000Z",
    }));
    const client = mockClient({
      createComment,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.createTaskComment("TASK-1", { body: "hello" });
    expect(createComment).toHaveBeenCalledWith("TASK-1", { body: "hello" });
  });

  it("deleteTaskComment() passes through to client.deleteComment", async () => {
    const deleteComment = vi.fn(async () => undefined);
    const client = mockClient({
      deleteComment,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.deleteTaskComment("CMT-1");
    expect(deleteComment).toHaveBeenCalledWith("CMT-1");
  });

  it("listTaskRuns() passes through to client.listRuns with taskId opt", async () => {
    const listRuns = vi.fn(async () => []);
    const client = mockClient({
      listRuns,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.listTaskRuns("TASK-1");
    expect(listRuns).toHaveBeenCalledWith({ taskId: "TASK-1" });
  });

  it("listTaskQuestions() passes through to client.listQuestions", async () => {
    const listQuestions = vi.fn(async () => []);
    const client = mockClient({
      listQuestions,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.listTaskQuestions("TASK-1");
    expect(listQuestions).toHaveBeenCalledWith({ taskId: "TASK-1" });
  });

  it("createTaskQuestion() passes through to client.createQuestion", async () => {
    const createQuestion = vi.fn(async () => ({ id: "Q-NEW" }));
    const client = mockClient({
      createQuestion,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.createTaskQuestion({
      taskId: "TASK-1",
      body: "why?",
      kind: "clarification",
    });
    expect(createQuestion).toHaveBeenCalledWith({
      taskId: "TASK-1",
      body: "why?",
      kind: "clarification",
    });
  });

  it("answerTaskQuestion() passes through to client.answerQuestion", async () => {
    const answerQuestion = vi.fn(async () => ({ id: "Q-1", answer: "yes" }));
    const client = mockClient({
      answerQuestion,
    } as unknown as Partial<DaemonClient>);

    const { result } = renderHook(() => useData(), {
      wrapper: ({ children }) => (
        <DataProvider
          projectId="PROJ-1"
          client={client}
          disableSse
          storage={memoryStorage()}
        >
          {children}
        </DataProvider>
      ),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await result.current.answerTaskQuestion("Q-1", { answer: "yes" });
    expect(answerQuestion).toHaveBeenCalledWith("Q-1", { answer: "yes" });
  });
});
