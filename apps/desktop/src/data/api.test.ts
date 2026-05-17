import { describe, expect, it, vi } from "vitest";
import { DaemonClient, DaemonError, resolveBaseUrl } from "./api";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function errorResponse(
  status: number,
  body: { error?: string; code?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveBaseUrl", () => {
  it("falls back to 127.0.0.1:19400 when env is unset", () => {
    expect(resolveBaseUrl()).toBe("http://127.0.0.1:19400");
  });
});

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

describe("DaemonClient", () => {
  it("attaches X-Clawket-Token from the loader on every request", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse([{ id: "PLAN-1" }]),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "secret-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listPlans();
    await client.listPlans();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const init = fetchImpl.mock.calls[0]![1];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Clawket-Token")).toBe("secret-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("caches the token across calls", async () => {
    const loader = vi.fn(async () => "tok");
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: loader,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listPlans();
    await client.listUnits();
    await client.listCycles();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("listProjects() GETs /projects", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse([{ id: "PROJ-1", name: "Project One", enabled: 1 }]),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const projects = await client.listProjects();
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/projects",
    );
    expect(projects).toEqual([
      { id: "PROJ-1", name: "Project One", enabled: 1 },
    ]);
  });

  it("builds query strings for filter args", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listTasks({ cycleId: "CYC-1", status: "todo" });
    await client.listTimeline("PROJ-1", { limit: 50, types: ["task", "plan"] });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks?cycle_id=CYC-1&status=todo",
    );
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      "http://127.0.0.1:19400/projects/PROJ-1/timeline?limit=50&types=task%2Cplan",
    );
  });

  it("returns parsed JSON for 2xx responses", async () => {
    const payload = [{ id: "PLAN-1", title: "Demo" }];
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse(payload));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const plans = await client.listPlans();
    expect(plans).toEqual(payload);
  });

  it("throws DaemonError preserving code + status for daemon errors", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      errorResponse(400, {
        error: "evidence is required to mark task done",
        code: "EVIDENCE_REQUIRED",
      }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.listTasks()).rejects.toMatchObject({
      name: "DaemonError",
      status: 400,
      code: "EVIDENCE_REQUIRED",
    });
  });

  it("invalidates token cache on 401 so the next call reloads", async () => {
    const loader = vi.fn(async () => "tok");
    let call = 0;
    const fetchImpl = vi.fn<FetchFn>(async () => {
      call++;
      return call === 1
        ? errorResponse(401, { error: "unauthorized" })
        : jsonResponse([]);
    });
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: loader,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.listPlans()).rejects.toBeInstanceOf(DaemonError);
    await client.listPlans();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("wraps fetch network failures into DaemonError(status=0)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => {
      throw new TypeError("ECONNREFUSED");
    });
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.listPlans()).rejects.toMatchObject({
      name: "DaemonError",
      status: 0,
      code: null,
    });
  });

  // ---- Knowledge mutations -------------------------------------------------

  it("createKnowledge() POSTs /knowledge with snake_case body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "KN-1", type: "document", title: "Spec" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createKnowledge({
      type: "document",
      title: "Spec",
      planId: "PLAN-1",
      content: "hello",
      contentFormat: "md",
      parentId: "KN-PARENT",
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/knowledge",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "document",
      title: "Spec",
      plan_id: "PLAN-1",
      content: "hello",
      content_format: "md",
      parent_id: "KN-PARENT",
    });
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(result).toEqual({ id: "KN-1", type: "document", title: "Spec" });
  });

  it("createKnowledge() omits optional keys that were not provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "KN-2" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createKnowledge({ type: "note", title: "min" });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "note",
      title: "min",
    });
  });

  it("updateKnowledge() PATCHes /knowledge/:id with only provided fields", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "KN-1", title: "Renamed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateKnowledge("KN-1", { title: "Renamed", wikiIdx: 5 });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/knowledge/KN-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Renamed",
      wiki_idx: 5,
    });
  });

  it("updateKnowledge() encodes parentId: null as JSON null (clear-parent intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "KN-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateKnowledge("KN-1", { parentId: null });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({ parent_id: null });
  });

  it("updateKnowledge() omits parent_id when key absent (leave-unchanged intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "KN-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateKnowledge("KN-1", { title: "X" });

    const init = fetchImpl.mock.calls[0]![1];
    const parsed = JSON.parse(init.body as string);
    expect(parsed).toEqual({ title: "X" });
    expect("parent_id" in parsed).toBe(false);
  });

  it("deleteKnowledge() DELETEs /knowledge/:id and returns soft-delete envelope", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "KN-1", soft: true }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.deleteKnowledge("KN-1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/knowledge/KN-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("DELETE");
    expect(result).toEqual({ ok: true, deleted: "KN-1", soft: true });
  });

  it("getKnowledge() GETs /knowledge/:id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "KN-1", title: "Doc" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.getKnowledge("KN-1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/knowledge/KN-1",
    );
    expect(result).toEqual({ id: "KN-1", title: "Doc" });
  });

  it("searchKnowledge() builds the /knowledge/search query string", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ hits: [], total_returned: 0, limit: 20, truncated: false }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.searchKnowledge({
      q: "wire contract",
      mode: "hybrid",
      limit: 10,
      projectId: "PROJ-1",
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/knowledge/search?q=wire+contract&mode=hybrid&limit=10&project_id=PROJ-1",
    );
  });

  it("importKnowledge() POSTs /knowledge/import with snake_case body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({
        imported: 0,
        skipped: 0,
        items: [],
        skippedItems: [],
        dry_run: true,
      }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.importKnowledge({
      cwd: "/repo",
      projectId: "PROJ-1",
      planId: "PLAN-1",
      dryRun: true,
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      cwd: "/repo",
      project_id: "PROJ-1",
      plan_id: "PLAN-1",
      dry_run: true,
    });
  });

  it("wikiTree() GETs /wiki/tree with optional query params", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.wikiTree();
    await client.wikiTree({ rootId: "KN-ROOT", planId: "PLAN-1" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/wiki/tree",
    );
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      "http://127.0.0.1:19400/wiki/tree?root_id=KN-ROOT&plan_id=PLAN-1",
    );
  });

  it("createPlan() POSTs /plans with snake_case body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({
        id: "PLAN-NEW",
        project_id: "PROJ-1",
        title: "New",
        description: null,
        source: "manual",
        source_path: null,
        created_at: "2026-01-01T00:00:00.000Z",
        approved_at: null,
        status: "draft",
      }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createPlan({
      projectId: "PROJ-1",
      title: "New",
      description: "body",
      source: "manual",
      sourcePath: "/tmp/p.md",
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:19400/plans");
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      project_id: "PROJ-1",
      title: "New",
      description: "body",
      source: "manual",
      source_path: "/tmp/p.md",
    });
  });

  it("createPlan() omits optional keys that were not provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "PLAN-X" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createPlan({ projectId: "PROJ-1", title: "Minimal" });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      project_id: "PROJ-1",
      title: "Minimal",
    });
  });

  it("updatePlan() PATCHes /plans/:id with only provided fields", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "PLAN-1", title: "Renamed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updatePlan("PLAN-1", { title: "Renamed" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/plans/PLAN-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Renamed" });
  });

  it("updatePlan() encodes description: null as JSON null (clear intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "PLAN-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updatePlan("PLAN-1", { description: null });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({ description: null });
  });

  it("approvePlan() POSTs /plans/:id/approve with empty body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "PLAN-1", status: "active" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.approvePlan("PLAN-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/plans/PLAN-1/approve",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("POST");
    expect(result.status).toBe("active");
  });

  it("completePlan() PATCHes /plans/:id with status=completed", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "PLAN-1", status: "completed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completePlan("PLAN-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/plans/PLAN-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "completed" });
    expect(result.status).toBe("completed");
  });

  it("deletePlan() DELETEs /plans/:id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "PLAN-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.deletePlan("PLAN-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/plans/PLAN-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("DELETE");
    expect(result).toEqual({ ok: true, deleted: "PLAN-1" });
  });

  it("createUnit() POSTs /units with snake_case body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "UNIT-NEW", plan_id: "PLAN-1", title: "U" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createUnit({
      planId: "PLAN-1",
      title: "U",
      goal: "outcome",
      idx: 3,
      executionMode: "parallel",
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:19400/units");
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      plan_id: "PLAN-1",
      title: "U",
      goal: "outcome",
      idx: 3,
      execution_mode: "parallel",
    });
  });

  it("createUnit() omits optional keys that were not provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "UNIT-X" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createUnit({ planId: "PLAN-1", title: "U" });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      plan_id: "PLAN-1",
      title: "U",
    });
  });

  it("updateUnit() PATCHes /units/:id with only provided fields", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "UNIT-1", title: "Renamed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateUnit("UNIT-1", { title: "Renamed" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/units/UNIT-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Renamed" });
  });

  it("updateUnit() encodes goal: null as JSON null (clear intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "UNIT-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateUnit("UNIT-1", { goal: null });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      goal: null,
    });
  });

  it("updateUnit() omits goal when key not present (leave unchanged)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "UNIT-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateUnit("UNIT-1", { title: "T" });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      title: "T",
    });
  });

  it("deleteUnit() DELETEs /units/:id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "UNIT-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.deleteUnit("UNIT-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/units/UNIT-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("DELETE");
    expect(result).toEqual({ ok: true, deleted: "UNIT-1" });
  });

  it("createCycle() POSTs /cycles with snake_case body including unit_id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CYC-NEW" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createCycle({
      projectId: "PROJ-1",
      unitId: "UNIT-1",
      title: "Round 1",
      goal: "discover",
      idx: 2,
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:19400/cycles");
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      project_id: "PROJ-1",
      unit_id: "UNIT-1",
      title: "Round 1",
      goal: "discover",
      idx: 2,
    });
  });

  it("updateCycle() PATCHes /cycles/:id with only provided fields", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "CYC-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateCycle("CYC-1", { title: "Renamed" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/cycles/CYC-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("PATCH");
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      title: "Renamed",
    });
  });

  it("updateCycle() encodes goal: null as JSON null (clear intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "CYC-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateCycle("CYC-1", { goal: null });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      goal: null,
    });
  });

  it("activateCycle() POSTs /cycles/:id/activate with empty body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CYC-1", status: "active" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.activateCycle("CYC-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/cycles/CYC-1/activate",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("POST");
    expect(result.status).toBe("active");
  });

  it("completeCycle() POSTs /cycles/:id/complete with empty body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CYC-1", status: "completed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeCycle("CYC-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/cycles/CYC-1/complete",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("POST");
    expect(result.status).toBe("completed");
  });

  it("deleteCycle() DELETEs /cycles/:id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "CYC-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.deleteCycle("CYC-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/cycles/CYC-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("DELETE");
    expect(result).toEqual({ ok: true, deleted: "CYC-1" });
  });

  // ---- Task mutations ------------------------------------------------------

  it("getTask() GETs /tasks/:id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1", title: "Demo" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const t = await client.getTask("TASK-1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks/TASK-1",
    );
    expect(t).toEqual({ id: "TASK-1", title: "Demo" });
  });

  it("createTask() POSTs /tasks with snake_case body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1", title: "T" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createTask({
      unitId: "UNIT-1",
      cycleId: "CYC-1",
      title: "T",
      body: "details",
      priority: "high",
      assignee: "alice",
      parentTaskId: "TASK-PARENT",
      type: "task",
      tier: "high",
      labels: ["ui", "refactor"],
    });

    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:19400/tasks");
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
      title: "T",
      body: "details",
      priority: "high",
      assignee: "alice",
      parent_task_id: "TASK-PARENT",
      type: "task",
      tier: "high",
      labels: ["ui", "refactor"],
    });
  });

  it("createTask() omits optional keys that were not provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-2" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createTask({
      unitId: "UNIT-1",
      cycleId: "CYC-1",
      title: "Minimal",
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      unit_id: "UNIT-1",
      cycle_id: "CYC-1",
      title: "Minimal",
    });
  });

  it("updateTask() PATCHes /tasks/:id with only provided fields", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1", title: "Renamed" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", { title: "Renamed" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks/TASK-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Renamed" });
  });

  it("updateTask() forwards status + evidence in a single patch", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1", status: "done" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      status: "done",
      evidence: "tests pass; PR #42",
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      status: "done",
      evidence: "tests pass; PR #42",
    });
  });

  it("updateTask() encodes assignee: null / body: null / evidence: null as JSON null (clear intent)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "TASK-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      assignee: null,
      body: null,
      evidence: null,
      estimatedEdits: null,
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      assignee: null,
      body: null,
      evidence: null,
      estimated_edits: null,
    });
  });

  it("updateTask() forwards labels + tier + priority verbatim", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "TASK-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      labels: ["ui", "p1"],
      tier: "high",
      priority: "critical",
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      labels: ["ui", "p1"],
      tier: "high",
      priority: "critical",
    });
  });

  it("updateTask() attaches _comment sidecar when non-empty", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "TASK-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      status: "blocked",
      comment: "waiting on daemon team",
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      status: "blocked",
      _comment: "waiting on daemon team",
    });
  });

  it("updateTask() omits _comment when empty string", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({ id: "TASK-1" }));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      status: "in_progress",
      comment: "",
    });

    const init = fetchImpl.mock.calls[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({
      status: "in_progress",
    });
  });

  it("updateTask() surfaces daemon EVIDENCE_REQUIRED error", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      errorResponse(400, {
        error: "evidence is required",
        code: "EVIDENCE_REQUIRED",
      }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.updateTask("TASK-1", { status: "done" }),
    ).rejects.toMatchObject({
      name: "DaemonError",
      status: 400,
      code: "EVIDENCE_REQUIRED",
    });
  });

  it("deleteTask() DELETEs /tasks/:id without body when no reason", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "TASK-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.deleteTask("TASK-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks/TASK-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("deleteTask() forwards reason as JSON body when provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1", status: "cancelled" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.deleteTask("TASK-1", { reason: "duplicate" });

    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "duplicate" });
  });

  it("deleteTask() trims whitespace-only reasons and omits body", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, deleted: "TASK-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.deleteTask("TASK-1", { reason: "   " });

    const init = fetchImpl.mock.calls[0]![1];
    expect(init.body).toBeUndefined();
  });

  it("updateTask() encodes move fields: parent_task_id / unit_id / cycle_id", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      parentTaskId: "TASK-PARENT",
      unitId: "UNIT-2",
      cycleId: "CYC-2",
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      parent_task_id: "TASK-PARENT",
      unit_id: "UNIT-2",
      cycle_id: "CYC-2",
    });
  });

  it("updateTask() encodes parent_task_id: null and cycle_id: null as JSON null (clear)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateTask("TASK-1", {
      parentTaskId: null,
      cycleId: null,
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      parent_task_id: null,
      cycle_id: null,
    });
  });

  it("createSubtask() POSTs /tasks/:parent/subtasks with title only", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-CHILD" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const r = await client.createSubtask("TASK-P", { title: "Child" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toMatch(/\/tasks\/TASK-P\/subtasks$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Child" });
    expect(r.id).toBe("TASK-CHILD");
  });

  it("createSubtask() forwards body / priority / assignee / unit_id / cycle_id / type when provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "TASK-CHILD" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createSubtask("TASK-P", {
      title: "Child",
      body: "Details",
      priority: "high",
      assignee: "alice",
      unitId: "UNIT-OVERRIDE",
      cycleId: "CYC-OVERRIDE",
      type: "bug",
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Child",
      body: "Details",
      priority: "high",
      assignee: "alice",
      unit_id: "UNIT-OVERRIDE",
      cycle_id: "CYC-OVERRIDE",
      type: "bug",
    });
  });

  it("createSubtask() unwraps the TaskWithEnvelope { task } sidecar shape", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({
        task: { id: "TASK-CHILD", title: "Child" },
        active_envelope: null,
      }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const r = await client.createSubtask("TASK-P", { title: "Child" });
    expect(r.id).toBe("TASK-CHILD");
  });

  // ---- Comments ------------------------------------------------------------

  it("listComments() GETs /tasks/:id/comments", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse([
        {
          id: "CMT-1",
          task_id: "TASK-1",
          author: "main",
          body: "hi",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.listComments("TASK-1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks/TASK-1/comments",
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("CMT-1");
  });

  it("createComment() POSTs /tasks/:id/comments with default author", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CMT-NEW" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createComment("TASK-1", { body: "hello" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/tasks/TASK-1/comments",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      author: "main",
      body: "hello",
    });
  });

  it("createComment() forwards explicit author override", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CMT-NEW" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createComment("TASK-1", { body: "hi", author: "reviewer" });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      author: "reviewer",
      body: "hi",
    });
  });

  it("updateComment() PATCHes /comments/:id with body only", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "CMT-1", body: "edited" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.updateComment("CMT-1", "edited");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/comments/CMT-1",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ body: "edited" });
  });

  it("deleteComment() DELETEs /comments/:id (soft-delete on daemon side)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ ok: true, soft_deleted: "CMT-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.deleteComment("CMT-1");

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/comments/CMT-1",
    );
    expect(fetchImpl.mock.calls[0]![1].method).toBe("DELETE");
  });

  // ---- Runs ----------------------------------------------------------------

  it("listRuns() GETs /runs without query string when no taskId", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listRuns();
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://127.0.0.1:19400/runs");
  });

  it("listRuns({ taskId }) appends task_id query param", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listRuns({ taskId: "TASK-1" });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/runs?task_id=TASK-1",
    );
  });

  it("listRuns({ projectId }) appends project_id query param", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listRuns({ projectId: "PROJ-1" });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/runs?project_id=PROJ-1",
    );
  });

  it("listCycleTasks(cycleId) GETs /cycles/:id/tasks", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listCycleTasks("CYC-1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/cycles/CYC-1/tasks",
    );
  });

  // ---- Questions -----------------------------------------------------------

  it("listQuestions() GETs /questions without query when no opts", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listQuestions();
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/questions",
    );
  });

  it("listQuestions({ taskId, pending }) builds query string", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse([]));
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.listQuestions({ taskId: "TASK-1", pending: true });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/questions?task_id=TASK-1&pending=true",
    );
  });

  it("createQuestion() POSTs /questions with default asked_by", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "Q-NEW" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createQuestion({ taskId: "TASK-1", body: "why?" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/questions",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      task_id: "TASK-1",
      body: "why?",
      asked_by: "main",
    });
  });

  it("createQuestion() forwards kind / origin / askedBy when provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "Q-NEW" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createQuestion({
      taskId: "TASK-1",
      body: "block?",
      kind: "blocker",
      origin: "plan",
      askedBy: "reviewer",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      task_id: "TASK-1",
      body: "block?",
      kind: "blocker",
      origin: "plan",
      asked_by: "reviewer",
    });
  });

  it("answerQuestion() POSTs /questions/:id/answer with answer only", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "Q-1", answer: "yes" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.answerQuestion("Q-1", { answer: "yes" });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:19400/questions/Q-1/answer",
    );
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ answer: "yes" });
  });

  it("answerQuestion() forwards answeredBy when provided", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ id: "Q-1" }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:19400",
      tokenLoader: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.answerQuestion("Q-1", {
      answer: "no",
      answeredBy: "alice",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({
      answer: "no",
      answered_by: "alice",
    });
  });
});
