import { useEffect } from "react";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["?"], description: "Show this help" },
  { keys: ["Cmd", "K"], description: "Open command palette" },
  { keys: ["Esc"], description: "Close modal / drawer" },
];

export default function HelpModal({ open, onClose }: HelpModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="help-modal"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-elevated w-[440px] max-w-[90vw] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-body-base font-semibold text-foreground">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-body-sm cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((row) => (
            <li
              key={row.keys.join("+")}
              className="flex items-center justify-between text-body-sm"
            >
              <span className="text-foreground">{row.description}</span>
              <span className="flex items-center gap-1">
                {row.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="text-label-sm font-mono px-1.5 py-0.5 rounded border border-border bg-surface-high text-muted"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-label-sm text-muted">
          Tip: most actions also live in the command palette.
        </p>
      </div>
    </div>
  );
}
