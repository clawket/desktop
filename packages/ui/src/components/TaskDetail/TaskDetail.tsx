import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { StatusPill, type TaskStatus } from "../StatusPill/StatusPill";
import { TierMark, type Tier } from "../TierMark/TierMark";
import { EvidenceChip } from "../EvidenceChip/EvidenceChip";
import { AgentTag } from "../AgentTag/AgentTag";

/**
 * TaskDetail — full right-pane view for a single task.
 *
 * Compound Pattern (ui-package.md §5):
 *   <TaskDetail.Root>
 *     <TaskDetail.Header ... />
 *     <TaskDetail.Section title="Body">…</TaskDetail.Section>
 *     <TaskDetail.Section title="Evidence">…</TaskDetail.Section>
 *   </TaskDetail.Root>
 *
 * Renders sticky header (ticket / title / meta chips) above scrollable body
 * sections. Pure presentational — markdown rendering / mutations live in the
 * desktop app.
 */

type RootProps = HTMLAttributes<HTMLElement>;

const Root = forwardRef<HTMLElement, RootProps>(function Root(
  { className, children, ...rest },
  ref,
) {
  return (
    <article
      ref={ref}
      data-slot="task-detail-root"
      className={cn(
        "flex h-full min-h-0 flex-col",
        "bg-background text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </article>
  );
});

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  ticket: string;
  title: string;
  status: TaskStatus;
  tier?: Tier;
  agent?: string;
  hasEvidence?: boolean;
  /** Action slot (right-aligned buttons). */
  actions?: ReactNode;
}

const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    ticket,
    title,
    status,
    tier,
    agent,
    hasEvidence,
    actions,
    className,
    ...rest
  },
  ref,
) {
  return (
    <header
      ref={ref}
      data-slot="task-detail-header"
      className={cn(
        "sticky top-0 z-10 shrink-0",
        "border-b border-border bg-surface",
        "px-6 py-4",
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-label-sm text-muted">{ticket}</span>
            <StatusPill status={status} size="sm" />
          </div>
          <h1 className="mt-1 text-headline-lg text-foreground">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {tier && <TierMark tier={tier} size="sm" />}
        {agent && <AgentTag agent={agent} size="sm" />}
        {hasEvidence !== undefined && (
          <EvidenceChip hasEvidence={hasEvidence} size="sm" />
        )}
      </div>
    </header>
  );
});

const Body = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Body({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        data-slot="task-detail-body"
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          "px-6 py-4",
          "flex flex-col gap-6",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

export interface SectionProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
}

const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, className, children, ...rest },
  ref,
) {
  const isEmpty =
    children == null ||
    children === false ||
    children === "" ||
    (Array.isArray(children) && children.length === 0);

  return (
    <section
      ref={ref}
      data-slot="task-detail-section"
      className={cn("flex flex-col gap-2", className)}
      {...rest}
    >
      <h2 className="text-label-sm uppercase tracking-wide text-muted">
        {title}
      </h2>
      {isEmpty ? (
        <p className="text-body-sm text-subtle italic">(empty)</p>
      ) : (
        <div className="text-body-base text-foreground">{children}</div>
      )}
    </section>
  );
});

export const TaskDetail = {
  Root,
  Header,
  Body,
  Section,
};

export type TaskDetailRootProps = RootProps;
export type TaskDetailHeaderProps = HeaderProps;
export type TaskDetailBodyProps = HTMLAttributes<HTMLDivElement>;
export type TaskDetailSectionProps = SectionProps;
