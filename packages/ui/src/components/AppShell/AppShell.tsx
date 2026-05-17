import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * AppShell — top-level desktop chrome.
 *
 * Compound Pattern (ui-package.md §5):
 *
 *   <AppShell.Root>
 *     <AppShell.Sidebar>…</AppShell.Sidebar>
 *     <AppShell.Content>
 *       <AppShell.Topbar>…</AppShell.Topbar>
 *       <AppShell.Main>…</AppShell.Main>
 *     </AppShell.Content>
 *   </AppShell.Root>
 *
 * Root owns the full viewport, Sidebar is fixed-width and scrolls
 * independently, Content stacks Topbar above Main with Main owning vertical
 * overflow. No internal state — pure layout composition.
 */

const Root = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Root({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        data-slot="app-shell-root"
        className={cn(
          "flex h-screen w-screen overflow-hidden",
          "bg-background text-foreground font-sans",
          className,
        )}
        {...rest}
      />
    );
  },
);

const Sidebar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Sidebar({ className, ...rest }, ref) {
    return (
      <aside
        ref={ref}
        data-slot="app-shell-sidebar"
        className={cn(
          "w-72 shrink-0",
          "border-r border-border bg-surface",
          "flex flex-col overflow-y-auto",
          className,
        )}
        {...rest}
      />
    );
  },
);

const Content = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Content({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        data-slot="app-shell-content"
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          "bg-background",
          className,
        )}
        {...rest}
      />
    );
  },
);

const Topbar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Topbar({ className, ...rest }, ref) {
    return (
      <header
        ref={ref}
        data-slot="app-shell-topbar"
        className={cn(
          "h-12 shrink-0",
          "border-b border-border bg-surface",
          "flex items-center gap-2 px-4",
          className,
        )}
        {...rest}
      />
    );
  },
);

const Main = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Main({ className, ...rest }, ref) {
    return (
      <main
        ref={ref}
        data-slot="app-shell-main"
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          "bg-background",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const AppShell = {
  Root,
  Sidebar,
  Content,
  Topbar,
  Main,
};

export type AppShellRootProps = HTMLAttributes<HTMLDivElement>;
export type AppShellSidebarProps = HTMLAttributes<HTMLElement>;
export type AppShellContentProps = HTMLAttributes<HTMLDivElement>;
export type AppShellTopbarProps = HTMLAttributes<HTMLElement>;
export type AppShellMainProps = HTMLAttributes<HTMLElement>;
