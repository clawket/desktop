import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WikiView } from "./WikiView";
import { DataProvider } from "../data/DataProvider";
import type {
  CreateKnowledgeInput,
  DaemonClient,
  KnowledgeSearchResponse,
  UpdateKnowledgePatch,
} from "../data/api";
import type {
  Knowledge,
  Plan,
  Project,
  WikiFile,
  WikiFileContent,
} from "../data/types";

function makeFile(p: Partial<WikiFile> & { path: string }): WikiFile {
  const path = p.path;
  const base = path.split("/").pop() ?? path;
  const stripped = base.replace(/\.(md|mdx)$/, "");
  return {
    name: stripped,
    title: p.title ?? stripped,
    size: 100,
    modified_at: 1_715_000_000_000,
    wiki_root: p.wiki_root ?? "docs",
    ...p,
    path,
  };
}

function makeContent(file: WikiFile, body: string): WikiFileContent {
  return {
    path: file.path,
    name: file.name,
    content: body,
    content_format: "markdown",
    size: body.length,
    modified_at: file.modified_at,
  };
}

const PLAN: Plan = {
  id: "PLAN-1",
  project_id: "PROJ-1",
  title: "Demo plan",
  description: null,
  source: "manual",
  source_path: null,
  created_at: "2026-05-14T04:00:00.000Z",
  approved_at: null,
  status: "active",
};

const PROJECT: Project = {
  id: "PROJ-1",
  name: "Test Project",
  description: null,
  key: null,
  enabled: 1,
  wiki_paths: ["docs", "guides"],
  cwds: ["/repo/clawket"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeKnowledge(p: Partial<Knowledge> & { id: string; title: string }): Knowledge {
  return {
    id: p.id,
    task_id: p.task_id ?? null,
    unit_id: p.unit_id ?? null,
    plan_id: p.plan_id ?? null,
    type: p.type ?? "wiki",
    title: p.title,
    content: p.content ?? `# ${p.title}\n\nBody for ${p.title}.`,
    content_format: p.content_format ?? "markdown",
    parent_id: p.parent_id ?? null,
    created_at: p.created_at ?? "2026-05-14T04:00:00.000Z",
    wiki_idx: p.wiki_idx,
    wiki_depth: p.wiki_depth,
    decision_text: p.decision_text,
    outcome: p.outcome,
  };
}

interface SeedOpts {
  files?: WikiFile[];
  project?: Project;
  fileBodies?: Record<string, string>;
  knowledge?: Knowledge[];
  searchHits?: Knowledge[] | ((q: string) => Knowledge[]);
}

function seededClient({
  files = DEFAULT_FILES,
  project = PROJECT,
  fileBodies = DEFAULT_BODIES,
  knowledge = [],
  searchHits,
}: SeedOpts = {}): DaemonClient {
  return {
    listProjects: vi.fn(async () => [project]),
    listPlans: vi.fn(async () => [PLAN]),
    listUnits: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listKnowledge: vi.fn(async () => knowledge),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => files),
    getWikiFile: vi.fn(async ({ path }: { path: string }) => {
      const file = files.find((f) => f.path === path);
      if (!file) throw new Error(`file not found: ${path}`);
      return makeContent(file, fileBodies[path] ?? `# ${file.title}\n`);
    }),
    searchKnowledge: vi.fn(
      async ({ q }: { q: string }): Promise<KnowledgeSearchResponse> => {
        const hits = typeof searchHits === "function" ? searchHits(q) : (searchHits ?? []);
        return {
          hits,
          total_returned: hits.length,
          limit: 50,
          truncated: false,
        };
      },
    ),
    createKnowledge: vi.fn(async (input: CreateKnowledgeInput) =>
      makeKnowledge({
        id: `K-new-${Date.now()}`,
        title: input.title,
        type: input.type,
        content: input.content ?? "",
        parent_id: input.parentId ?? null,
      }),
    ),
    updateKnowledge: vi.fn(
      async (id: string, _patch: UpdateKnowledgePatch) =>
        makeKnowledge({ id, title: "updated" }),
    ),
    deleteKnowledge: vi.fn(async (id: string) => ({
      ok: true,
      deleted: id,
      soft: false,
    })),
    getPlan: vi.fn(),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
}

const DEFAULT_FILES: WikiFile[] = [
  makeFile({
    path: "docs/overview.md",
    title: "Overview",
    wiki_root: "docs",
  }),
  makeFile({
    path: "docs/api/auth.md",
    title: "Auth API",
    wiki_root: "docs",
  }),
  makeFile({
    path: "docs/api/sse.md",
    title: "SSE wire",
    wiki_root: "docs",
  }),
  makeFile({
    path: "guides/getting-started.md",
    title: "Getting started",
    wiki_root: "guides",
  }),
  makeFile({ path: "README.md", title: "Readme", wiki_root: "." }),
];

const DEFAULT_BODIES: Record<string, string> = {
  "docs/overview.md": "# Overview\n\nClawket overview body.",
  "docs/api/auth.md": "# Auth\n\nAuth API body.",
  "docs/api/sse.md": "# SSE\n\nSSE wire body.",
  "guides/getting-started.md": "# Getting started\n\nQuickstart body.",
  "README.md": "# Readme\n\nProject readme.",
};

function renderWith(client: DaemonClient = seededClient()) {
  return render(
    <DataProvider projectId="PROJ-1" client={client} disableSse>
      <WikiView client={client} />
    </DataProvider>,
  );
}

describe("WikiView (path-based tree, multi wiki_root)", () => {
  it("renders one row per wiki file (leaf rows only)", async () => {
    renderWith();
    await waitFor(() =>
      expect(screen.getAllByTestId("wiki-file-row")).toHaveLength(
        DEFAULT_FILES.length,
      ),
    );
  });

  it("groups files under wiki_root headers, with '.' first", async () => {
    renderWith();
    const groups = await screen.findAllByTestId("wiki-root-row");
    // 3 groups: ".", "docs", "guides"
    const labels = groups.map((g) => g.getAttribute("data-wiki-root"));
    expect(labels).toEqual([".", "docs", "guides"]);
  });

  it("shows directory folders inside docs (api/) as folder rows", async () => {
    renderWith();
    await screen.findAllByTestId("wiki-file-row");
    const folders = screen.getAllByTestId("wiki-folder-row");
    const names = folders.map((f) => f.getAttribute("data-folder"));
    expect(names).toContain("api");
  });

  it("opens the first file by default and renders its markdown body", async () => {
    renderWith();
    // First file in sorted order: README under "." root group.
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader")).toHaveAttribute(
        "data-path",
        "README.md",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader-title")).toHaveTextContent(
        "README",
      ),
    );
    expect(
      within(screen.getByTestId("wiki-markdown")).getByText(/Project readme/),
    ).toBeInTheDocument();
  });

  it("switches the reader when another file row is clicked", async () => {
    const user = userEvent.setup();
    renderWith();
    await screen.findAllByTestId("wiki-file-row");
    const target = screen
      .getAllByTestId("wiki-file-row")
      .find((el) => el.getAttribute("data-path") === "docs/overview.md")!;
    await user.click(target);
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader")).toHaveAttribute(
        "data-path",
        "docs/overview.md",
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("wiki-markdown")).getByText(
          /Clawket overview body/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it("marks the active file row with data-active=true", async () => {
    const user = userEvent.setup();
    renderWith();
    await screen.findAllByTestId("wiki-file-row");
    const target = screen
      .getAllByTestId("wiki-file-row")
      .find((el) => el.getAttribute("data-path") === "docs/api/sse.md")!;
    await user.click(target);
    await waitFor(() => expect(target.getAttribute("data-active")).toBe("true"));
  });

  it("collapses a folder when clicked (folder row toggles open state)", async () => {
    const user = userEvent.setup();
    renderWith();
    await screen.findAllByTestId("wiki-file-row");
    const apiFolder = screen
      .getAllByTestId("wiki-folder-row")
      .find((f) => f.getAttribute("data-folder") === "api")!;
    expect(apiFolder.getAttribute("data-open")).toBe("true");
    await user.click(apiFolder);
    expect(apiFolder.getAttribute("data-open")).toBeNull();
    // Files inside the collapsed folder must disappear from the DOM.
    const rows = screen.getAllByTestId("wiki-file-row").map((r) =>
      r.getAttribute("data-path"),
    );
    expect(rows).not.toContain("docs/api/auth.md");
    expect(rows).not.toContain("docs/api/sse.md");
  });

  it("shows the empty tree hint when the active project has no wiki files", async () => {
    renderWith(seededClient({ files: [] }));
    await waitFor(() =>
      expect(screen.getByTestId("wiki-tree-empty")).toBeInTheDocument(),
    );
  });

  it("shows the no-cwd hint when the active project has no registered cwd", async () => {
    const noCwd: Project = { ...PROJECT, cwds: [] };
    renderWith(seededClient({ files: [], project: noCwd }));
    await waitFor(() =>
      expect(screen.getByTestId("wiki-tree-empty")).toHaveTextContent(
        /no registered cwd/i,
      ),
    );
  });

  it("calls getWikiFile with the project's cwd + project id + selected path", async () => {
    const client = seededClient();
    renderWith(client);
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader")).toHaveAttribute(
        "data-path",
        "README.md",
      ),
    );
    expect(client.getWikiFile).toHaveBeenCalledWith({
      cwd: "/repo/clawket",
      path: "README.md",
      projectId: "PROJ-1",
    });
  });

  it("surfaces getWikiFile errors in the reader panel", async () => {
    const client = seededClient();
    (client.getWikiFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );
    renderWith(client);
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader-error")).toHaveTextContent("boom"),
    );
  });
});

const DEFAULT_KNOWLEDGE: Knowledge[] = [
  makeKnowledge({
    id: "K-root-1",
    title: "Architecture overview",
    wiki_idx: 1,
  }),
  makeKnowledge({
    id: "K-child-1",
    title: "Data flow",
    parent_id: "K-root-1",
    wiki_idx: 1,
  }),
  makeKnowledge({
    id: "K-child-2",
    title: "Wire format",
    parent_id: "K-root-1",
    wiki_idx: 2,
  }),
  makeKnowledge({
    id: "K-root-2",
    title: "Release procedure",
    wiki_idx: 2,
  }),
];

describe("WikiView (knowledge tree)", () => {
  it("renders knowledge entries as a tree with parent_id nesting", async () => {
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await waitFor(() =>
      expect(screen.getAllByTestId("wiki-knowledge-row")).toHaveLength(4),
    );
    const ids = screen
      .getAllByTestId("wiki-knowledge-row")
      .map((r) => r.getAttribute("data-knowledge-id"));
    // wiki_idx sort: root 1 first, then its children, then root 2.
    expect(ids).toEqual(["K-root-1", "K-child-1", "K-child-2", "K-root-2"]);
  });

  it("opens first knowledge entry by default and renders its content", async () => {
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader")).toHaveAttribute(
        "data-knowledge-id",
        "K-root-1",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader-title")).toHaveTextContent(
        "Architecture overview",
      ),
    );
    expect(
      within(screen.getByTestId("wiki-markdown")).getByText(
        /Body for Architecture overview/,
      ),
    ).toBeInTheDocument();
  });

  it("switches the reader to a knowledge entry when its row is clicked", async () => {
    const user = userEvent.setup();
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await screen.findAllByTestId("wiki-knowledge-row");
    const row = screen
      .getAllByTestId("wiki-knowledge-row")
      .find((r) => r.getAttribute("data-knowledge-id") === "K-child-2")!;
    await user.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("wiki-reader")).toHaveAttribute(
        "data-knowledge-id",
        "K-child-2",
      ),
    );
    expect(screen.getByTestId("wiki-reader-title")).toHaveTextContent(
      "Wire format",
    );
  });

  it("collapses children when the toggle is clicked", async () => {
    const user = userEvent.setup();
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await screen.findAllByTestId("wiki-knowledge-row");
    const toggle = screen
      .getAllByTestId("wiki-knowledge-toggle")
      .find((t) => t.getAttribute("data-knowledge-id") === "K-root-1")!;
    expect(toggle.getAttribute("data-open")).toBe("true");
    await user.click(toggle);
    const ids = screen
      .getAllByTestId("wiki-knowledge-row")
      .map((r) => r.getAttribute("data-knowledge-id"));
    expect(ids).not.toContain("K-child-1");
    expect(ids).not.toContain("K-child-2");
  });
});

describe("WikiView (search)", () => {
  it("filters knowledge tree by server-side searchKnowledge hits", async () => {
    const user = userEvent.setup();
    const client = seededClient({
      knowledge: DEFAULT_KNOWLEDGE,
      searchHits: (q) =>
        DEFAULT_KNOWLEDGE.filter((k) =>
          k.title.toLowerCase().includes(q.toLowerCase()),
        ),
    });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    await user.type(screen.getByTestId("wiki-search-input"), "Wire");
    await waitFor(() => {
      const ids = screen
        .getAllByTestId("wiki-knowledge-row")
        .map((r) => r.getAttribute("data-knowledge-id"));
      // "Wire format" matched + its ancestor "K-root-1" is kept for context.
      expect(ids).toEqual(["K-root-1", "K-child-2"]);
    });
    expect(client.searchKnowledge).toHaveBeenCalled();
  });

  it("filters file tree client-side by path/title contains", async () => {
    const user = userEvent.setup();
    renderWith();
    await screen.findAllByTestId("wiki-file-row");
    await user.type(screen.getByTestId("wiki-search-input"), "auth");
    await waitFor(() => {
      const paths = screen
        .getAllByTestId("wiki-file-row")
        .map((r) => r.getAttribute("data-path"));
      expect(paths).toEqual(["docs/api/auth.md"]);
    });
  });

  it("shows the no-results hint when search returns nothing", async () => {
    const user = userEvent.setup();
    renderWith(
      seededClient({
        knowledge: DEFAULT_KNOWLEDGE,
        searchHits: () => [],
      }),
    );
    await screen.findAllByTestId("wiki-knowledge-row");
    await user.type(screen.getByTestId("wiki-search-input"), "nonexistent");
    await waitFor(() =>
      expect(screen.getByTestId("wiki-search-empty")).toBeInTheDocument(),
    );
  });
});

describe("WikiView (create modal)", () => {
  it("opens the create modal when the + New button is clicked", async () => {
    const user = userEvent.setup();
    renderWith();
    await user.click(await screen.findByTestId("wiki-create-button"));
    expect(screen.getByTestId("wiki-create-modal")).toBeInTheDocument();
  });

  it("submits createKnowledge with title + content + parent", async () => {
    const user = userEvent.setup();
    const client = seededClient({ knowledge: DEFAULT_KNOWLEDGE });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    await user.click(screen.getByTestId("wiki-create-button"));
    await user.type(
      screen.getByTestId("wiki-modal-title-input"),
      "New note",
    );
    await user.type(
      screen.getByTestId("wiki-modal-content-input"),
      "Hello body",
    );
    await user.click(screen.getByTestId("wiki-modal-submit"));
    await waitFor(() => expect(client.createKnowledge).toHaveBeenCalledTimes(1));
    const call = (client.createKnowledge as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as CreateKnowledgeInput;
    expect(call.title).toBe("New note");
    expect(call.content).toBe("Hello body");
    expect(call.type).toBe("wiki");
    // The default parent equals the currently-selected knowledge entry.
    expect(call.parentId).toBe("K-root-1");
  });

  it("closes the modal when cancel is clicked without calling create", async () => {
    const user = userEvent.setup();
    const client = seededClient();
    renderWith(client);
    await user.click(await screen.findByTestId("wiki-create-button"));
    await user.click(screen.getByTestId("wiki-modal-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("wiki-create-modal")).not.toBeInTheDocument(),
    );
    expect(client.createKnowledge).not.toHaveBeenCalled();
  });
});

describe("WikiView (edit modal)", () => {
  it("opens the edit modal pre-filled with the target's title", async () => {
    const user = userEvent.setup();
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await screen.findAllByTestId("wiki-knowledge-row");
    const editBtn = screen
      .getAllByTestId("wiki-knowledge-edit-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-root-2")!;
    await user.click(editBtn);
    const modal = screen.getByTestId("wiki-edit-modal");
    expect(modal.getAttribute("data-knowledge-id")).toBe("K-root-2");
    const titleInput = screen.getByTestId(
      "wiki-modal-title-input",
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("Release procedure");
  });

  it("submits updateKnowledge with only the changed fields", async () => {
    const user = userEvent.setup();
    const client = seededClient({ knowledge: DEFAULT_KNOWLEDGE });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    const editBtn = screen
      .getAllByTestId("wiki-knowledge-edit-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-root-1")!;
    await user.click(editBtn);
    const titleInput = screen.getByTestId(
      "wiki-modal-title-input",
    ) as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, "New title");
    await user.click(screen.getByTestId("wiki-modal-submit"));
    await waitFor(() => expect(client.updateKnowledge).toHaveBeenCalledTimes(1));
    const [id, patch] = (client.updateKnowledge as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(id).toBe("K-root-1");
    expect(patch).toEqual({ title: "New title" });
  });

  it("encodes parent clear as parentId=null in the patch", async () => {
    const user = userEvent.setup();
    const client = seededClient({ knowledge: DEFAULT_KNOWLEDGE });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    const editBtn = screen
      .getAllByTestId("wiki-knowledge-edit-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-child-1")!;
    await user.click(editBtn);
    await user.selectOptions(
      screen.getByTestId("wiki-modal-parent-select"),
      "__clear__",
    );
    await user.click(screen.getByTestId("wiki-modal-submit"));
    await waitFor(() => expect(client.updateKnowledge).toHaveBeenCalledTimes(1));
    const [, patch] = (client.updateKnowledge as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(patch).toEqual({ parentId: null });
  });
});

describe("WikiView (delete confirm)", () => {
  it("opens delete confirm with the target title", async () => {
    const user = userEvent.setup();
    renderWith(seededClient({ knowledge: DEFAULT_KNOWLEDGE }));
    await screen.findAllByTestId("wiki-knowledge-row");
    const delBtn = screen
      .getAllByTestId("wiki-knowledge-delete-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-root-2")!;
    await user.click(delBtn);
    const confirm = screen.getByTestId("wiki-delete-confirm");
    expect(confirm.getAttribute("data-knowledge-id")).toBe("K-root-2");
    expect(confirm).toHaveTextContent("Release procedure");
  });

  it("calls deleteKnowledge when confirm is clicked", async () => {
    const user = userEvent.setup();
    const client = seededClient({ knowledge: DEFAULT_KNOWLEDGE });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    const delBtn = screen
      .getAllByTestId("wiki-knowledge-delete-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-child-1")!;
    await user.click(delBtn);
    await user.click(screen.getByTestId("wiki-modal-submit"));
    await waitFor(() => expect(client.deleteKnowledge).toHaveBeenCalledTimes(1));
    const [id] = (client.deleteKnowledge as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(id).toBe("K-child-1");
  });

  it("does not delete when cancel is clicked", async () => {
    const user = userEvent.setup();
    const client = seededClient({ knowledge: DEFAULT_KNOWLEDGE });
    renderWith(client);
    await screen.findAllByTestId("wiki-knowledge-row");
    const delBtn = screen
      .getAllByTestId("wiki-knowledge-delete-button")
      .find((b) => b.getAttribute("data-knowledge-id") === "K-root-1")!;
    await user.click(delBtn);
    await user.click(screen.getByTestId("wiki-modal-cancel"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("wiki-delete-confirm"),
      ).not.toBeInTheDocument(),
    );
    expect(client.deleteKnowledge).not.toHaveBeenCalled();
  });
});
