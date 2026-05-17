import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@clawket/ui";
import { ViewShell } from "./ViewShell";
import { useData } from "../data/DataProvider";
import { getDaemonClient } from "../data/api";
import type {
  CreateKnowledgeInput,
  DaemonClient,
  UpdateKnowledgePatch,
} from "../data/api";
import type {
  Knowledge,
  Plan,
  Project,
  WikiFile,
  WikiFileContent,
} from "../data/types";

// ---------------------------------------------------------------------------
// File-tree helpers (filesystem .md surface)
// ---------------------------------------------------------------------------

interface FileTreeNode {
  name: string;
  filePath?: string;
  file?: WikiFile;
  children: FileTreeNode[];
}

interface WikiRootGroup {
  root: string;
  files: WikiFile[];
  tree: FileTreeNode[];
}

function groupByWikiRoot(files: WikiFile[]): WikiRootGroup[] {
  const map = new Map<string, WikiFile[]>();
  for (const f of files) {
    const list = map.get(f.wiki_root) ?? [];
    list.push(f);
    map.set(f.wiki_root, list);
  }
  const groups: WikiRootGroup[] = [];
  for (const [root, list] of map.entries()) {
    groups.push({ root, files: list, tree: buildFileTree(list) });
  }
  groups.sort((a, b) => {
    if (a.root === "." && b.root !== ".") return -1;
    if (b.root === "." && a.root !== ".") return 1;
    return a.root.localeCompare(b.root, undefined, { sensitivity: "base" });
  });
  return groups;
}

function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        current.children.push({
          name: part,
          filePath: f.path,
          file: f,
          children: [],
        });
      } else {
        let folder = current.children.find(
          (c) => c.name === part && !c.filePath,
        );
        if (!folder) {
          folder = { name: part, children: [] };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }
  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    const aFolder = !a.filePath;
    const bFolder = !b.filePath;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortTree(n.children);
  }
}

function findFirstFile(nodes: FileTreeNode[]): string | null {
  for (const n of nodes) {
    if (n.filePath) return n.filePath;
    const inner = findFirstFile(n.children);
    if (inner) return inner;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Knowledge-tree helpers (SQLite knowledge surface)
// ---------------------------------------------------------------------------

interface KnowledgeNode {
  knowledge: Knowledge;
  children: KnowledgeNode[];
}

function buildKnowledgeTree(items: Knowledge[]): KnowledgeNode[] {
  const byParent = new Map<string | null, Knowledge[]>();
  for (const k of items) {
    const key = k.parent_id ?? null;
    const list = byParent.get(key) ?? [];
    list.push(k);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const ai = a.wiki_idx ?? Number.MAX_SAFE_INTEGER;
      const bi = b.wiki_idx ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
  }
  function build(parentId: string | null): KnowledgeNode[] {
    return (byParent.get(parentId) ?? []).map((k) => ({
      knowledge: k,
      children: build(k.id),
    }));
  }
  return build(null);
}

/**
 * Walk the knowledge tree and collect ids of every entry whose title matches
 * the query, plus every ancestor needed to render them in-context.
 */
function filterKnowledgeIds(
  nodes: KnowledgeNode[],
  predicate: (k: Knowledge) => boolean,
): Set<string> {
  const keep = new Set<string>();
  function walk(node: KnowledgeNode, ancestors: string[]): boolean {
    let kept = predicate(node.knowledge);
    const childAncestors = [...ancestors, node.knowledge.id];
    for (const c of node.children) {
      if (walk(c, childAncestors)) kept = true;
    }
    if (kept) {
      keep.add(node.knowledge.id);
      for (const a of ancestors) keep.add(a);
    }
    return kept;
  }
  for (const root of nodes) walk(root, []);
  return keep;
}

function filterFileTree(
  nodes: FileTreeNode[],
  query: string,
): FileTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  function visit(node: FileTreeNode): FileTreeNode | null {
    if (node.filePath) {
      const title = node.file?.title.toLowerCase() ?? "";
      const name = node.name.toLowerCase();
      const path = node.filePath.toLowerCase();
      if (
        title.includes(q) ||
        name.includes(q) ||
        path.includes(q)
      ) {
        return node;
      }
      return null;
    }
    const keptChildren = node.children
      .map(visit)
      .filter((n): n is FileTreeNode => n !== null);
    if (keptChildren.length === 0) return null;
    return { ...node, children: keptChildren };
  }
  return nodes
    .map(visit)
    .filter((n): n is FileTreeNode => n !== null);
}

function findActivePlan(plans: Plan[]): Plan | null {
  return plans.find((p) => p.status === "active") ?? plans[0] ?? null;
}

function findActiveProject(
  projects: Project[],
  activeProjectId: string | null,
): Project | null {
  if (!activeProjectId) return null;
  return projects.find((p) => p.id === activeProjectId) ?? null;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

type Selection =
  | { kind: "knowledge"; id: string }
  | { kind: "file"; path: string };

function selectionEquals(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "knowledge" && b.kind === "knowledge") return a.id === b.id;
  if (a.kind === "file" && b.kind === "file") return a.path === b.path;
  return false;
}

// ---------------------------------------------------------------------------
// File tree row components
// ---------------------------------------------------------------------------

interface FileNodeProps {
  node: FileTreeNode;
  depth: number;
  selection: Selection | null;
  onSelect: (file: WikiFile) => void;
}

function FileNode({ node, depth, selection, onSelect }: FileNodeProps) {
  const isFolder = !node.filePath;
  const [open, setOpen] = useState(true);
  if (isFolder) {
    return (
      <li>
        <button
          type="button"
          data-testid="wiki-folder-row"
          data-folder={node.name}
          data-open={open || undefined}
          onClick={() => setOpen((v) => !v)}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={cn(
            "w-full text-left rounded-md",
            "py-1.5 pr-2 text-body-sm",
            "flex items-center gap-2 text-muted hover:text-foreground hover:bg-surface-high",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <span aria-hidden className="font-mono text-label-sm text-subtle">
            {open ? "▾" : "▸"}
          </span>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        {open && node.children.length > 0 && (
          <ul className="flex flex-col">
            {node.children.map((child) => (
              <FileNode
                key={`${child.name}:${child.filePath ?? "folder"}`}
                node={child}
                depth={depth + 1}
                selection={selection}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }
  const active =
    selection?.kind === "file" && selection.path === node.filePath;
  const title = node.file?.title || node.file?.name || node.name;
  return (
    <li>
      <button
        type="button"
        data-testid="wiki-file-row"
        data-path={node.filePath}
        data-active={active || undefined}
        onClick={() => node.file && onSelect(node.file)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "w-full text-left rounded-md",
          "py-1.5 pr-2 text-body-sm",
          "flex items-center gap-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          active
            ? "bg-surface-high text-foreground"
            : "text-muted hover:text-foreground hover:bg-surface-high",
        )}
      >
        <span aria-hidden className="font-mono text-label-sm text-subtle">
          ·
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
    </li>
  );
}

interface WikiRootGroupViewProps {
  group: WikiRootGroup;
  selection: Selection | null;
  onSelect: (file: WikiFile) => void;
}

function WikiRootGroupView({
  group,
  selection,
  onSelect,
}: WikiRootGroupViewProps) {
  const [open, setOpen] = useState(true);
  return (
    <li data-testid="wiki-root-group" data-wiki-root={group.root}>
      <button
        type="button"
        data-testid="wiki-root-row"
        data-wiki-root={group.root}
        data-open={open || undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full text-left rounded-md",
          "px-3 py-1.5 text-label-sm font-semibold uppercase tracking-wide",
          "flex items-center gap-2 text-subtle hover:text-foreground hover:bg-surface-high",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <span aria-hidden className="font-mono">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {group.root === "." ? "/" : group.root}
        </span>
        <span className="tabular-nums text-label-sm font-normal text-muted">
          {group.files.length}
        </span>
      </button>
      {open && (
        <ul className="flex flex-col">
          {group.tree.map((node) => (
            <FileNode
              key={`${node.name}:${node.filePath ?? "folder"}`}
              node={node}
              depth={1}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Knowledge tree row component
// ---------------------------------------------------------------------------

interface KnowledgeNodeViewProps {
  node: KnowledgeNode;
  depth: number;
  selection: Selection | null;
  visible: Set<string> | null;
  onSelect: (k: Knowledge) => void;
  onEdit: (k: Knowledge) => void;
  onDelete: (k: Knowledge) => void;
}

function KnowledgeNodeView({
  node,
  depth,
  selection,
  visible,
  onSelect,
  onEdit,
  onDelete,
}: KnowledgeNodeViewProps) {
  const [open, setOpen] = useState(true);
  if (visible && !visible.has(node.knowledge.id)) return null;
  const k = node.knowledge;
  const active = selection?.kind === "knowledge" && selection.id === k.id;
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md",
          active
            ? "bg-surface-high text-foreground"
            : "text-muted hover:text-foreground hover:bg-surface-high",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            data-testid="wiki-knowledge-toggle"
            data-knowledge-id={k.id}
            data-open={open || undefined}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            style={{ marginLeft: 4 + depth * 14 }}
            className="shrink-0 px-1 text-label-sm text-subtle font-mono"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span
            aria-hidden
            style={{ marginLeft: 4 + depth * 14 }}
            className="shrink-0 px-1 font-mono text-label-sm text-subtle"
          >
            ·
          </span>
        )}
        <button
          type="button"
          data-testid="wiki-knowledge-row"
          data-knowledge-id={k.id}
          data-active={active || undefined}
          onClick={() => onSelect(k)}
          className={cn(
            "flex-1 min-w-0 text-left py-1.5 pr-1 text-body-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md",
          )}
        >
          <span className="block truncate">{k.title}</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            data-testid="wiki-knowledge-edit-button"
            data-knowledge-id={k.id}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(k);
            }}
            className="px-1.5 py-0.5 text-label-sm text-subtle hover:text-foreground rounded"
            title="Edit"
          >
            ✎
          </button>
          <button
            type="button"
            data-testid="wiki-knowledge-delete-button"
            data-knowledge-id={k.id}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(k);
            }}
            className="px-1.5 py-0.5 text-label-sm text-subtle hover:text-danger rounded"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
      {open && hasChildren && (
        <ul className="flex flex-col">
          {node.children.map((child) => (
            <KnowledgeNodeView
              key={child.knowledge.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              visible={visible}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

interface ModalShellProps {
  testId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  dataAttrs?: Record<string, string>;
}

function ModalShell({
  testId,
  title,
  onClose,
  children,
  dataAttrs,
}: ModalShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId}
      {...dataAttrs}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-headline-sm font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="wiki-modal-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

interface CreateModalProps {
  parents: Knowledge[];
  defaultParentId: string | null;
  onClose: () => void;
  onSubmit: (input: CreateKnowledgeInput) => Promise<void>;
}

function WikiCreateModal({
  parents,
  defaultParentId,
  onClose,
  onSubmit,
}: CreateModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("wiki");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        content: content || undefined,
        parentId: parentId || undefined,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to create");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      testId="wiki-create-modal"
      title="New knowledge entry"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Title</span>
          <input
            type="text"
            data-testid="wiki-modal-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="rounded border border-border bg-surface-high px-3 py-2 text-body-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Type</span>
          <select
            data-testid="wiki-modal-type-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-border bg-surface-high px-3 py-2 text-body-sm text-foreground"
          >
            <option value="wiki">wiki</option>
            <option value="decision">decision</option>
            <option value="note">note</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Parent</span>
          <select
            data-testid="wiki-modal-parent-select"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded border border-border bg-surface-high px-3 py-2 text-body-sm text-foreground"
          >
            <option value="">(none)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Content (markdown)</span>
          <textarea
            data-testid="wiki-modal-content-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="rounded border border-border bg-surface-high px-3 py-2 font-mono text-body-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        {err && (
          <div
            data-testid="wiki-modal-error"
            className="text-body-sm text-danger"
          >
            {err}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          data-testid="wiki-modal-cancel"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-body-sm text-muted hover:bg-surface-high"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="wiki-modal-submit"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="rounded bg-primary px-3 py-1.5 text-body-sm text-on-primary font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </footer>
    </ModalShell>
  );
}

interface EditModalProps {
  target: Knowledge;
  parents: Knowledge[];
  onClose: () => void;
  onSubmit: (patch: UpdateKnowledgePatch) => Promise<void>;
}

function WikiEditModal({
  target,
  parents,
  onClose,
  onSubmit,
}: EditModalProps) {
  const [title, setTitle] = useState(target.title);
  const [content, setContent] = useState(target.content);
  // Tri-state parent encoding:
  //   "" → unchanged (omit key)
  //   "__clear__" → null (PATCH clears parent)
  //   "<id>" → set parent
  const [parentValue, setParentValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = title.trim().length > 0 && !submitting;
  const selectableParents = parents.filter((p) => p.id !== target.id);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    const patch: UpdateKnowledgePatch = {};
    if (title.trim() !== target.title) patch.title = title.trim();
    if (content !== target.content) patch.content = content;
    if (parentValue === "__clear__") patch.parentId = null;
    else if (parentValue !== "") patch.parentId = parentValue;
    try {
      await onSubmit(patch);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to update");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      testId="wiki-edit-modal"
      title="Edit knowledge entry"
      onClose={onClose}
      dataAttrs={{ "data-knowledge-id": target.id }}
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Title</span>
          <input
            type="text"
            data-testid="wiki-modal-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="rounded border border-border bg-surface-high px-3 py-2 text-body-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Parent</span>
          <select
            data-testid="wiki-modal-parent-select"
            value={parentValue}
            onChange={(e) => setParentValue(e.target.value)}
            className="rounded border border-border bg-surface-high px-3 py-2 text-body-sm text-foreground"
          >
            <option value="">(unchanged)</option>
            <option value="__clear__">(clear parent)</option>
            {selectableParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label-sm text-muted">
          <span>Content (markdown)</span>
          <textarea
            data-testid="wiki-modal-content-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className="rounded border border-border bg-surface-high px-3 py-2 font-mono text-body-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        {err && (
          <div
            data-testid="wiki-modal-error"
            className="text-body-sm text-danger"
          >
            {err}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          data-testid="wiki-modal-cancel"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-body-sm text-muted hover:bg-surface-high"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="wiki-modal-submit"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="rounded bg-primary px-3 py-1.5 text-body-sm text-on-primary font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </footer>
    </ModalShell>
  );
}

interface DeleteConfirmProps {
  target: Knowledge;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function WikiDeleteConfirm({
  target,
  onClose,
  onConfirm,
}: DeleteConfirmProps) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handleConfirm = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to delete");
      setSubmitting(false);
    }
  };
  return (
    <ModalShell
      testId="wiki-delete-confirm"
      title="Delete knowledge entry?"
      onClose={onClose}
      dataAttrs={{ "data-knowledge-id": target.id }}
    >
      <div className="flex flex-col gap-2 px-5 py-4">
        <p className="text-body-sm text-foreground">
          Delete <strong>{target.title}</strong>?
        </p>
        <p className="text-label-sm text-muted">
          This action is recorded in the knowledge timeline and may soft-delete
          depending on retention policy.
        </p>
        {err && (
          <div
            data-testid="wiki-modal-error"
            className="text-body-sm text-danger"
          >
            {err}
          </div>
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          data-testid="wiki-modal-cancel"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-body-sm text-muted hover:bg-surface-high"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="wiki-modal-submit"
          onClick={() => void handleConfirm()}
          disabled={submitting}
          className="rounded bg-danger px-3 py-1.5 text-body-sm text-on-primary font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Deleting…" : "Delete"}
        </button>
      </footer>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// WikiView main
// ---------------------------------------------------------------------------

interface WikiViewProps {
  client?: DaemonClient;
}

const SEARCH_DEBOUNCE_MS = 250;

export function WikiView({ client }: WikiViewProps = {}) {
  const {
    status,
    error,
    plans,
    projects,
    activeProjectId,
    wikiFiles,
    knowledge,
  } = useData();

  const project = useMemo(
    () => findActiveProject(projects, activeProjectId),
    [projects, activeProjectId],
  );
  const cwd = project?.cwds[0] ?? null;
  const apiClient = useMemo(() => client ?? getDaemonClient(), [client]);

  const groups = useMemo(() => groupByWikiRoot(wikiFiles), [wikiFiles]);
  const knowledgeTree = useMemo(() => buildKnowledgeTree(knowledge), [
    knowledge,
  ]);

  // Default selection: first knowledge entry, else first file.
  const firstFilePath = useMemo(() => {
    for (const g of groups) {
      const first = findFirstFile(g.tree);
      if (first) return first;
    }
    return null;
  }, [groups]);
  const firstKnowledgeId = knowledgeTree[0]?.knowledge.id ?? null;
  const defaultSelection: Selection | null = useMemo(() => {
    if (firstKnowledgeId) return { kind: "knowledge", id: firstKnowledgeId };
    if (firstFilePath) return { kind: "file", path: firstFilePath };
    return null;
  }, [firstKnowledgeId, firstFilePath]);

  const [selection, setSelection] = useState<Selection | null>(
    defaultSelection,
  );

  // Fall back when current selection disappears or there is no selection yet.
  useEffect(() => {
    if (!selection) {
      if (defaultSelection) setSelection(defaultSelection);
      return;
    }
    if (selection.kind === "file") {
      if (!wikiFiles.some((f) => f.path === selection.path)) {
        setSelection(defaultSelection);
      }
    } else if (selection.kind === "knowledge") {
      if (!knowledge.some((k) => k.id === selection.id)) {
        setSelection(defaultSelection);
      }
    }
  }, [selection, defaultSelection, wikiFiles, knowledge]);

  // ---- File content fetch (knowledge content comes from in-memory state) ---
  const [fileContent, setFileContent] = useState<WikiFileContent | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const latestRequestRef = useRef<string | null>(null);

  const loadFileContent = useCallback(
    async (path: string) => {
      if (!cwd || !activeProjectId) {
        setFileContent(null);
        return;
      }
      latestRequestRef.current = path;
      setReaderLoading(true);
      setReaderError(null);
      try {
        const c = await apiClient.getWikiFile({
          cwd,
          path,
          projectId: activeProjectId,
        });
        if (latestRequestRef.current !== path) return;
        setFileContent(c);
      } catch (e) {
        if (latestRequestRef.current !== path) return;
        setReaderError((e as Error).message || "Failed to load file");
        setFileContent(null);
      } finally {
        if (latestRequestRef.current === path) setReaderLoading(false);
      }
    },
    [apiClient, cwd, activeProjectId],
  );

  useEffect(() => {
    setReaderError(null);
    if (selection?.kind === "file") {
      void loadFileContent(selection.path);
    } else {
      latestRequestRef.current = null;
      setFileContent(null);
      setReaderLoading(false);
    }
  }, [selection, loadFileContent]);

  // ---- Search ------------------------------------------------------------
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<Knowledge[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchHits(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    apiClient
      .searchKnowledge({
        q: searchQuery,
        mode: "hybrid",
        limit: 50,
        projectId: activeProjectId ?? undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setSearchHits(res.hits);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSearchError((e as Error).message || "Search failed");
        setSearchHits([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeProjectId, apiClient]);

  const visibleKnowledgeIds = useMemo<Set<string> | null>(() => {
    if (!searchQuery) return null;
    if (!searchHits) return new Set();
    const hitIds = new Set(searchHits.map((h) => h.id));
    return filterKnowledgeIds(knowledgeTree, (k) => hitIds.has(k.id));
  }, [searchQuery, searchHits, knowledgeTree]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    return groups
      .map((g) => ({ ...g, tree: filterFileTree(g.tree, searchQuery) }))
      .filter((g) => g.tree.length > 0);
  }, [groups, searchQuery]);

  // ---- Modals ------------------------------------------------------------
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Knowledge | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Knowledge | null>(null);

  const handleCreate = useCallback(
    async (input: CreateKnowledgeInput) => {
      const created = await apiClient.createKnowledge(input);
      // The knowledge:created SSE event will refresh the list, but for tests
      // (and quick-feedback environments without SSE) optimistically focus the
      // new entry once it appears on the next render cycle.
      setSelection({ kind: "knowledge", id: created.id });
    },
    [apiClient],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: UpdateKnowledgePatch) => {
      await apiClient.updateKnowledge(id, patch);
    },
    [apiClient],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await apiClient.deleteKnowledge(id);
      setSelection((cur) =>
        cur && cur.kind === "knowledge" && cur.id === id ? null : cur,
      );
    },
    [apiClient],
  );

  // ---- Early-return states ------------------------------------------------
  if (status === "loading" || status === "idle") {
    return (
      <ViewShell title="Wiki" subtitle="Loading…" testId="view-wiki">
        <div className="p-6 text-body-sm text-muted">Loading data…</div>
      </ViewShell>
    );
  }
  if (status === "error") {
    return (
      <ViewShell title="Wiki" subtitle="Failed to load" testId="view-wiki">
        <div data-testid="wiki-error" className="p-6 text-body-sm text-danger">
          {error ?? "Unknown error"}
        </div>
      </ViewShell>
    );
  }

  const activePlan = findActivePlan(plans);
  const totalFiles = wikiFiles.length;
  const totalKnowledge = knowledge.length;
  const subtitle = activePlan
    ? `${activePlan.title} · ${totalKnowledge} notes · ${totalFiles} files`
    : `${totalKnowledge} notes · ${totalFiles} files`;

  const isEmpty = totalFiles === 0 && totalKnowledge === 0;

  // ---- Reader content ----------------------------------------------------
  let readerBody: ReactNode;
  if (readerError) {
    readerBody = (
      <div
        data-testid="wiki-reader-error"
        className="p-6 text-body-sm text-danger"
      >
        {readerError}
      </div>
    );
  } else if (selection?.kind === "knowledge") {
    const entry = knowledge.find((k) => k.id === selection.id);
    if (!entry) {
      readerBody = (
        <div
          data-testid="wiki-empty"
          className="flex h-full items-center justify-center p-6 text-body-sm text-muted"
        >
          Knowledge entry not found.
        </div>
      );
    } else {
      readerBody = (
        <>
          <header
            data-testid="wiki-reader-header"
            className="border-b border-border px-6 py-4"
          >
            <p className="text-label-sm text-muted font-mono">
              knowledge · {entry.type}
            </p>
            <p
              data-testid="wiki-reader-title"
              className="text-headline-md font-semibold text-foreground mt-1"
            >
              {entry.title}
            </p>
            <p className="text-label-sm text-subtle tabular-nums mt-1">
              {entry.created_at}
            </p>
          </header>
          <div
            data-testid="wiki-markdown"
            className={cn(
              "px-6 py-5",
              "prose prose-invert max-w-none",
              "text-body-base text-foreground",
              "[&_h1]:text-headline-md [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3",
              "[&_h2]:text-headline-sm [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2",
              "[&_h3]:text-body-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
              "[&_p]:my-3",
              "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3",
              "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3",
              "[&_li]:my-1",
              "[&_code]:font-mono [&_code]:text-label-sm [&_code]:bg-surface-high [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
              "[&_table]:border-collapse [&_table]:my-3 [&_table]:w-full",
              "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-surface",
              "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
              "[&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
              "[&_strong]:font-semibold [&_strong]:text-foreground",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entry.content}
            </ReactMarkdown>
          </div>
        </>
      );
    }
  } else if (selection?.kind === "file" && fileContent) {
    readerBody = (
      <>
        <header
          data-testid="wiki-reader-header"
          className="border-b border-border px-6 py-4"
        >
          <p className="text-label-sm text-muted font-mono">
            {selection.path}
          </p>
          <p
            data-testid="wiki-reader-title"
            className="text-headline-md font-semibold text-foreground mt-1"
          >
            {fileContent.name}
          </p>
          <p className="text-label-sm text-subtle tabular-nums mt-1">
            {new Date(fileContent.modified_at).toLocaleString()}
          </p>
        </header>
        <div
          data-testid="wiki-markdown"
          className={cn(
            "px-6 py-5",
            "prose prose-invert max-w-none",
            "text-body-base text-foreground",
            "[&_h1]:text-headline-md [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3",
            "[&_h2]:text-headline-sm [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2",
            "[&_h3]:text-body-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
            "[&_p]:my-3",
            "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3",
            "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3",
            "[&_li]:my-1",
            "[&_code]:font-mono [&_code]:text-label-sm [&_code]:bg-surface-high [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
            "[&_table]:border-collapse [&_table]:my-3 [&_table]:w-full",
            "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-surface",
            "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
            "[&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
            "[&_strong]:font-semibold [&_strong]:text-foreground",
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {fileContent.content}
          </ReactMarkdown>
        </div>
      </>
    );
  } else if (selection?.kind === "file" && readerLoading) {
    readerBody = (
      <div
        data-testid="wiki-reader-loading"
        className="p-6 text-body-sm text-muted"
      >
        Loading file…
      </div>
    );
  } else {
    readerBody = (
      <div
        data-testid="wiki-empty"
        className="flex h-full items-center justify-center p-6 text-body-sm text-muted"
      >
        {isEmpty ? "No wiki files yet." : "Select a file to read."}
      </div>
    );
  }

  const hasResults =
    (visibleKnowledgeIds?.size ?? 0) > 0 || filteredGroups.length > 0;

  return (
    <ViewShell title="Wiki" subtitle={subtitle} testId="view-wiki">
      <div className="flex h-full min-h-0">
        <aside
          data-testid="wiki-file-tree"
          aria-label="Wiki file tree"
          className={cn(
            "w-[280px] shrink-0 border-r border-border bg-surface",
            "min-h-0 overflow-y-auto",
            "flex flex-col",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border bg-surface-high px-3 py-2">
            <input
              type="search"
              data-testid="wiki-search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search notes & files…"
              className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-body-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              data-testid="wiki-create-button"
              onClick={() => setCreateOpen(true)}
              title="New knowledge entry"
              className="shrink-0 rounded bg-primary px-2 py-1 text-label-sm font-medium text-on-primary hover:opacity-90"
            >
              + New
            </button>
          </div>
          {searching && (
            <div
              data-testid="wiki-search-status"
              className="px-3 py-2 text-label-sm text-muted"
            >
              Searching…
            </div>
          )}
          {searchError && (
            <div
              data-testid="wiki-search-error"
              className="px-3 py-2 text-label-sm text-danger"
            >
              {searchError}
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-2">
            {isEmpty ? (
              <div
                data-testid="wiki-tree-empty"
                className="px-4 py-6 text-body-sm text-muted"
              >
                {cwd
                  ? "No .md files under this project's wiki paths."
                  : "Active project has no registered cwd."}
              </div>
            ) : searchQuery && !searching && !hasResults ? (
              <div
                data-testid="wiki-search-empty"
                className="px-4 py-6 text-body-sm text-muted"
              >
                No results for &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <>
                {knowledgeTree.length > 0 && (
                  <section data-testid="wiki-knowledge-section">
                    <h3 className="px-3 py-1 text-label-sm font-semibold uppercase tracking-wide text-subtle">
                      Knowledge
                    </h3>
                    <ul className="flex flex-col">
                      {knowledgeTree.map((node) => (
                        <KnowledgeNodeView
                          key={node.knowledge.id}
                          node={node}
                          depth={0}
                          selection={selection}
                          visible={visibleKnowledgeIds}
                          onSelect={(k) =>
                            setSelection({ kind: "knowledge", id: k.id })
                          }
                          onEdit={(k) => setEditTarget(k)}
                          onDelete={(k) => setDeleteTarget(k)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {filteredGroups.length > 0 && (
                  <section data-testid="wiki-files-section" className="mt-2">
                    <h3 className="px-3 py-1 text-label-sm font-semibold uppercase tracking-wide text-subtle">
                      Files
                    </h3>
                    <ul className="flex flex-col">
                      {filteredGroups.map((group) => (
                        <WikiRootGroupView
                          key={group.root}
                          group={group}
                          selection={selection}
                          onSelect={(f) =>
                            setSelection({ kind: "file", path: f.path })
                          }
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>

        <article
          data-testid="wiki-reader"
          data-path={
            selection?.kind === "file" ? selection.path : undefined
          }
          data-knowledge-id={
            selection?.kind === "knowledge" ? selection.id : undefined
          }
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {readerBody}
        </article>
      </div>

      {createOpen && (
        <WikiCreateModal
          parents={knowledge}
          defaultParentId={
            selection?.kind === "knowledge" ? selection.id : null
          }
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {editTarget && (
        <WikiEditModal
          target={editTarget}
          parents={knowledge}
          onClose={() => setEditTarget(null)}
          onSubmit={async (patch) => {
            await handleUpdate(editTarget.id, patch);
          }}
        />
      )}
      {deleteTarget && (
        <WikiDeleteConfirm
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await handleDelete(deleteTarget.id);
          }}
        />
      )}
    </ViewShell>
  );
}

// Re-exports for testing — the selection helpers and filter helpers are pure
// utilities exercised through the component but exposed here for granular
// coverage.
export const __test = {
  groupByWikiRoot,
  buildFileTree,
  buildKnowledgeTree,
  filterFileTree,
  filterKnowledgeIds,
  selectionEquals,
};
