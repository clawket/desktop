import { useEffect } from "react";

/** Global keyboard shortcut binder. Mirrors clawket/web's hook so chord
 *  behavior is identical across surfaces.
 *
 *  Chords:
 *    - Cmd/Ctrl+K → command palette
 *    - ?           → help modal (shortcut cheatsheet)
 *
 *  Suppressed when the active element is a text input (input, textarea,
 *  select, or contenteditable) so users can type "?" inside fields normally. */
export interface GlobalShortcutHandlers {
  onPalette?: () => void;
  onHelp?: () => void;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        if (handlers.onPalette) {
          e.preventDefault();
          handlers.onPalette();
        }
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTextInput(e.target)) return;
        if (handlers.onHelp) {
          e.preventDefault();
          handlers.onHelp();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
