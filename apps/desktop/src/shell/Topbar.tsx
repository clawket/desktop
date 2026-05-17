import { AppShell, Button, cn, useTheme } from "@clawket/ui";
import { VIEWS, type ViewId } from "./views";

const THEME_GLYPH = {
  light: "☀",
  dark: "☾",
  system: "◑",
} as const;
const THEME_LABEL = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

interface TopbarProps {
  activeView: ViewId;
  onViewChange: (id: ViewId) => void;
  onOpenPalette: () => void;
  daemonHealthy?: boolean;
  /** Click handler for the daemon-health pill when unhealthy. Triggers an
   *  immediate re-poll (web parity — `clawket/web/src/components/shell/Topbar.tsx:113-114`). */
  onReconnect?: () => void;
}

export function Topbar({
  activeView,
  onViewChange,
  onOpenPalette,
  daemonHealthy = true,
  onReconnect,
}: TopbarProps) {
  const { stored: themePref, cycle: cycleTheme } = useTheme();
  return (
    <AppShell.Topbar data-testid="app-topbar">
      <nav
        role="tablist"
        aria-label="Workspace views"
        className="flex items-center gap-1"
      >
        {VIEWS.map((v) => {
          const isActive = v.id === activeView;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-view={v.id}
              data-active={isActive || undefined}
              onClick={() => onViewChange(v.id)}
              className={cn(
                "rounded-md px-3 py-1.5",
                "text-body-sm font-medium",
                "transition-colors",
                isActive
                  ? "bg-surface-high text-foreground"
                  : "text-muted hover:text-foreground hover:bg-surface-high/60",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-live="polite"
          data-testid="daemon-health"
          data-healthy={daemonHealthy}
          onClick={daemonHealthy ? undefined : onReconnect}
          disabled={daemonHealthy}
          title={
            daemonHealthy
              ? "Daemon connected"
              : "Daemon down — click to reconnect"
          }
          className={cn(
            "inline-flex items-center gap-1.5",
            "rounded-md px-2 py-1",
            "text-label-sm",
            daemonHealthy
              ? "text-success cursor-default disabled:opacity-100"
              : "text-danger hover:bg-danger/10 cursor-pointer",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              daemonHealthy ? "bg-success" : "bg-danger animate-pulse",
            )}
          />
          {daemonHealthy ? "daemon ok" : "daemon down"}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          data-testid="theme-toggle"
          data-theme-pref={themePref}
          aria-label={`Theme: ${THEME_LABEL[themePref]} (click to cycle)`}
          title={`Theme: ${THEME_LABEL[themePref]}`}
        >
          {THEME_GLYPH[themePref]}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenPalette}
          data-testid="open-command-palette"
          aria-label="Open command palette (⌘K)"
        >
          ⌘K
        </Button>
      </div>
    </AppShell.Topbar>
  );
}
