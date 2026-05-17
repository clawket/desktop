import { Badge, cn } from "@clawket/ui";

export type DetailBreadcrumbKind = "plan" | "unit" | "task";

export interface DetailBreadcrumbItem {
  type: DetailBreadcrumbKind;
  id: string;
  label: string;
  ticket?: string | null;
  status?: string | null;
}

interface DetailBreadcrumbProps {
  items: DetailBreadcrumbItem[];
  onSelectItem?: (item: { type: DetailBreadcrumbKind; id: string }) => void;
}

const KIND_LABEL: Record<DetailBreadcrumbKind, string> = {
  plan: "Plan",
  unit: "Unit",
  task: "Task",
};

export function DetailBreadcrumb({ items, onSelectItem }: DetailBreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="detail-breadcrumb"
      className="text-label-sm"
      data-testid="detail-breadcrumb"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isCurrent = idx === items.length - 1;
          const kindLabel = KIND_LABEL[item.type];
          return (
            <li
              key={`${item.type}-${item.id}`}
              className="flex items-center gap-1"
              aria-current={isCurrent ? "page" : undefined}
              data-testid={`detail-breadcrumb-${item.type}`}
            >
              {isCurrent ? (
                <span className="flex max-w-[18rem] items-center gap-1 truncate font-medium text-foreground">
                  <span className="text-muted">{kindLabel}:</span>
                  {item.ticket && (
                    <span className="font-mono text-primary">{item.ticket}</span>
                  )}
                  <span className="truncate">{item.label}</span>
                  {item.status && (
                    <Badge variant="neutral" size="sm">
                      {item.status}
                    </Badge>
                  )}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectItem?.({ type: item.type, id: item.id })}
                  disabled={!onSelectItem}
                  className={cn(
                    "flex max-w-[14rem] items-center gap-1 truncate text-primary",
                    onSelectItem && "hover:underline",
                    "disabled:cursor-default disabled:text-muted disabled:no-underline",
                  )}
                  data-detail-id={item.id}
                  data-detail-type={item.type}
                  title={item.label}
                >
                  <span className="text-muted">{kindLabel}:</span>
                  {item.ticket && (
                    <span className="font-mono">{item.ticket}</span>
                  )}
                  <span className="truncate text-foreground">{item.label}</span>
                </button>
              )}
              {!isCurrent && (
                <span aria-hidden className="text-muted">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
