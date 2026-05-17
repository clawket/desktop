// Click-to-open list of projects with single-select. Anchored to the Sidebar
// header. Native <select> was rejected for theme parity (browser-default
// rendering does not match the dark workbench). Closes on outside click, ESC,
// or selection. Filters disabled projects to the bottom of the list with a
// muted style — they remain selectable (the daemon's "enabled" flag is a hint
// to surfaces, not an access gate at the API layer). Search input mirrors the
// web ProjectSwitcher: case-insensitive substring match against name /
// description / cwds; auto-focused on open and cleared on close.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@clawket/ui";
import type { Project } from "../data/types";
import type { CreateProjectInput, UpdateProjectPatch } from "../data/api";
import { ProjectCreateModal } from "./ProjectCreateModal";
import { ProjectSettingsModal } from "./ProjectSettingsModal";

interface ProjectSwitcherProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  /** Optional fallback label when no project is loaded yet. */
  fallbackLabel?: string;
  /**
   * Optional create handler. When provided, the dropdown renders a footer
   * `+ New project` item that opens the create modal. After successful
   * creation, the new project is activated via `onSelect`. Returning the
   * created project lets the switcher show feedback without an extra round
   * trip through the data layer.
   */
  onCreateProject?: (input: CreateProjectInput) => Promise<Project>;
  /**
   * Optional update handler. When provided and an active project exists, the
   * dropdown renders a footer `⚙ Project settings` item that opens the
   * settings modal for the active project.
   */
  onUpdateProject?: (
    id: string,
    patch: UpdateProjectPatch,
  ) => Promise<Project>;
}

function projectLabel(p: Project): string {
  if (p.key && p.key.length > 0) return `${p.name} · ${p.key}`;
  return p.name;
}

function projectMatchesQuery(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (p.name.toLowerCase().includes(needle)) return true;
  if (p.description && p.description.toLowerCase().includes(needle)) return true;
  if (p.cwds.some((c) => c.toLowerCase().includes(needle))) return true;
  return false;
}

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
  fallbackLabel = "Loading…",
  onCreateProject,
  onUpdateProject,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const active =
    (activeProjectId && projects.find((p) => p.id === activeProjectId)) || null;

  // Sort: active first, then enabled by name, then disabled. Filter by query.
  const sorted = useMemo(() => {
    const filtered = projects.filter((p) => projectMatchesQuery(p, query));
    return filtered.sort((a, b) => {
      if (a.id === activeProjectId) return -1;
      if (b.id === activeProjectId) return 1;
      const aEn = a.enabled !== 0 ? 1 : 0;
      const bEn = b.enabled !== 0 ? 1 : 0;
      if (aEn !== bEn) return bEn - aEn;
      return a.name.localeCompare(b.name);
    });
  }, [projects, query, activeProjectId]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    const handle = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(handle);
    };
  }, [open, closeMenu]);

  const buttonLabel = active ? projectLabel(active) : fallbackLabel;
  const disabled = projects.length === 0;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        data-testid="project-switcher-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled && !onCreateProject}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5",
          "rounded-md px-2 py-1",
          "text-left text-body-sm font-semibold text-foreground",
          "hover:bg-surface-high focus:bg-surface-high focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <span aria-hidden className="text-label-sm text-muted">
          ▾
        </span>
      </button>
      {open ? (
        <div
          data-testid="project-switcher-list"
          className={cn(
            "absolute left-0 right-0 top-full z-40 mt-1",
            "rounded-md border border-border bg-surface-high",
            "shadow-elevated",
          )}
        >
          <div className="p-2 border-b border-border">
            <input
              ref={searchRef}
              type="text"
              data-testid="project-switcher-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-2 py-1",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:outline-none focus:border-primary",
              )}
            />
          </div>
          <ul
            role="listbox"
            aria-label="Projects"
            className="max-h-64 overflow-auto py-1"
          >
            {sorted.length === 0 ? (
              <li
                data-testid="project-switcher-empty"
                className="px-3 py-2 text-body-sm text-muted italic"
              >
                {projects.length === 0 ? "No projects yet" : "No matches"}
              </li>
            ) : (
              sorted.map((p) => {
                const isActive = p.id === activeProjectId;
                const isDisabled = p.enabled === 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      data-testid={`project-switcher-option-${p.id}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        onSelect(p.id);
                        closeMenu();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5",
                        "text-left text-body-sm text-foreground",
                        "hover:bg-surface focus:bg-surface focus:outline-none",
                        isActive && "bg-surface",
                        isDisabled && "text-muted italic",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {projectLabel(p)}
                      </span>
                      {isActive ? (
                        <span aria-hidden className="text-label-sm text-muted">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
            {onCreateProject ? (
              <li className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-testid="project-switcher-new"
                  onClick={() => {
                    closeMenu();
                    setCreateOpen(true);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5",
                    "text-left text-body-sm text-primary",
                    "hover:bg-surface focus:bg-surface focus:outline-none",
                  )}
                >
                  <span aria-hidden>＋</span>
                  <span>New project</span>
                </button>
              </li>
            ) : null}
            {onUpdateProject && active ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-testid="project-switcher-settings"
                  onClick={() => {
                    closeMenu();
                    setSettingsOpen(true);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5",
                    "text-left text-body-sm text-foreground",
                    "hover:bg-surface focus:bg-surface focus:outline-none",
                  )}
                >
                  <span aria-hidden>⚙</span>
                  <span>Project settings</span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {createOpen && onCreateProject ? (
        <ProjectCreateModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (input) => {
            const created = await onCreateProject(input);
            setCreateOpen(false);
            onSelect(created.id);
          }}
        />
      ) : null}
      {settingsOpen && onUpdateProject && active ? (
        <ProjectSettingsModal
          project={active}
          onClose={() => setSettingsOpen(false)}
          onSubmit={async (patch) => {
            await onUpdateProject(active.id, patch);
            setSettingsOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
