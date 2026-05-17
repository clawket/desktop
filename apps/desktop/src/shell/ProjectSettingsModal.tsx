import { useEffect, useMemo, useState } from "react";
import { cn } from "@clawket/ui";
import type { Project } from "../data/types";
import type { UpdateProjectPatch } from "../data/api";

export interface ProjectSettingsModalProps {
  project: Project;
  onClose: () => void;
  onSubmit: (patch: UpdateProjectPatch) => Promise<void>;
}

interface MultilineListInputProps {
  testId: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}

function MultilineListInput({
  testId,
  label,
  placeholder,
  value,
  onChange,
}: MultilineListInputProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label-sm uppercase tracking-wide text-muted">
        {label}
      </span>
      <textarea
        data-testid={testId}
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-md border border-border bg-background px-3 py-2",
          "text-body-sm text-foreground placeholder:text-muted",
          "focus:border-primary focus:outline-none",
          "font-mono",
        )}
      />
    </label>
  );
}

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function ProjectSettingsModal({
  project,
  onClose,
  onSubmit,
}: ProjectSettingsModalProps) {
  const initial = useMemo(
    () => ({
      name: project.name,
      key: project.key ?? "",
      description: project.description ?? "",
      wikiPathsRaw: project.wiki_paths.join("\n"),
      cwdsRaw: project.cwds.join("\n"),
      enabled: project.enabled !== 0,
    }),
    [project],
  );

  const [name, setName] = useState(initial.name);
  const [projectKey, setProjectKey] = useState(initial.key);
  const [description, setDescription] = useState(initial.description);
  const [wikiPathsRaw, setWikiPathsRaw] = useState(initial.wikiPathsRaw);
  const [cwdsRaw, setCwdsRaw] = useState(initial.cwdsRaw);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildPatch(): UpdateProjectPatch {
    const patch: UpdateProjectPatch = {};
    if (trimmedName !== initial.name) patch.name = trimmedName;
    const trimmedKey = projectKey.trim();
    if (trimmedKey !== initial.key) {
      patch.key = trimmedKey.length > 0 ? trimmedKey : null;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription !== initial.description) {
      patch.description =
        trimmedDescription.length > 0 ? trimmedDescription : null;
    }
    const wikiPaths = splitLines(wikiPathsRaw);
    if (!arraysEqual(wikiPaths, project.wiki_paths)) {
      patch.wiki_paths = wikiPaths;
    }
    const cwds = splitLines(cwdsRaw);
    if (!arraysEqual(cwds, project.cwds)) {
      patch.cwds = cwds;
    }
    if (enabled !== initial.enabled) {
      patch.enabled = enabled ? 1 : 0;
    }
    return patch;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const patch = buildPatch();
      await onSubmit(patch);
    } catch (e) {
      setErr((e as Error).message || "Failed to update project");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project settings"
      data-testid="project-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-headline-sm font-semibold text-foreground">
              Project settings
            </h2>
            <p
              data-testid="project-settings-id"
              className="text-label-sm text-muted truncate"
            >
              {project.id}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="project-settings-close"
            onClick={onClose}
            className="rounded p-1 text-subtle hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Name <span className="text-error">*</span>
            </span>
            <input
              type="text"
              data-testid="project-settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Ticket prefix (key)
            </span>
            <input
              type="text"
              data-testid="project-settings-key"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              placeholder="MP"
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
                "font-mono uppercase",
              )}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-sm uppercase tracking-wide text-muted">
              Description
            </span>
            <textarea
              data-testid="project-settings-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project is for…"
              className={cn(
                "rounded-md border border-border bg-background px-3 py-2",
                "text-body-sm text-foreground placeholder:text-muted",
                "focus:border-primary focus:outline-none",
              )}
            />
          </label>
          <MultilineListInput
            testId="project-settings-wiki-paths"
            label="Wiki paths (one per line)"
            placeholder="docs"
            value={wikiPathsRaw}
            onChange={setWikiPathsRaw}
          />
          <MultilineListInput
            testId="project-settings-cwds"
            label="Working directories (one per line, absolute)"
            placeholder="/Users/me/dev/my-project"
            value={cwdsRaw}
            onChange={setCwdsRaw}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="project-settings-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-body-sm text-foreground">
              Enabled (surfaces in the active project switcher)
            </span>
          </label>
          {err && (
            <p
              role="alert"
              data-testid="project-settings-error"
              className="text-body-sm text-error"
            >
              {err}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            data-testid="project-settings-cancel"
            onClick={onClose}
            className={cn(
              "rounded-md px-3 py-1.5 text-body-sm text-foreground",
              "hover:bg-surface-high focus:outline-none",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="project-settings-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5",
              "text-body-sm font-semibold text-primary-foreground",
              "hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
