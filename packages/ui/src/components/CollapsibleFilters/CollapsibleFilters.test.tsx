import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollapsibleFilters } from "./CollapsibleFilters";

function makeMemoryStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
    key: (i) => Object.keys(data)[i] ?? null,
  };
}

function makeThrowingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: () => {
      throw new Error("denied");
    },
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
    key: () => {
      throw new Error("denied");
    },
  };
}

describe("CollapsibleFilters", () => {
  it("renders title (default 'Filters') and body when expanded", () => {
    render(
      <CollapsibleFilters viewId="x" storage={null}>
        <div data-testid="body-content">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByTestId("body-content")).toBeInTheDocument();
    expect(
      screen.getByTestId("collapsible-filters-toggle"),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("uses the custom title when provided", () => {
    render(
      <CollapsibleFilters viewId="x" title="Event filters" storage={null}>
        <div />
      </CollapsibleFilters>,
    );
    expect(screen.getByText("Event filters")).toBeInTheDocument();
  });

  it("collapses on click, hiding the body and writing storage", () => {
    const storage = makeMemoryStorage();
    render(
      <CollapsibleFilters viewId="backlog" storage={storage}>
        <div data-testid="body-content">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("body-content")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("collapsible-filters-toggle"));
    expect(screen.queryByTestId("body-content")).toBeNull();
    expect(
      screen.getByTestId("collapsible-filters-toggle"),
    ).toHaveAttribute("aria-expanded", "false");
    expect(storage.getItem("clawket.filters.backlog.collapsed")).toBe("1");
  });

  it("restores collapsed=true from storage on mount", () => {
    const storage = makeMemoryStorage({
      "clawket.filters.backlog.collapsed": "1",
    });
    render(
      <CollapsibleFilters viewId="backlog" storage={storage}>
        <div data-testid="body-content">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.queryByTestId("body-content")).toBeNull();
    expect(
      screen.getByTestId("collapsible-filters-toggle"),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("restores collapsed=false from storage even when defaultCollapsed=true", () => {
    const storage = makeMemoryStorage({
      "clawket.filters.timeline.collapsed": "0",
    });
    render(
      <CollapsibleFilters
        viewId="timeline"
        storage={storage}
        defaultCollapsed
      >
        <div data-testid="body-content">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("body-content")).toBeInTheDocument();
  });

  it("honors defaultCollapsed when storage has no entry", () => {
    const storage = makeMemoryStorage();
    render(
      <CollapsibleFilters viewId="board" storage={storage} defaultCollapsed>
        <div data-testid="body-content">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.queryByTestId("body-content")).toBeNull();
  });

  it("isolates state per viewId in storage", () => {
    const storage = makeMemoryStorage({
      "clawket.filters.backlog.collapsed": "1",
      "clawket.filters.timeline.collapsed": "0",
    });
    const { rerender } = render(
      <CollapsibleFilters viewId="backlog" storage={storage}>
        <div data-testid="body">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.queryByTestId("body")).toBeNull();
    rerender(
      <CollapsibleFilters viewId="timeline" storage={storage}>
        <div data-testid="body">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("body")).toBeInTheDocument();
  });

  it("soft-fails when storage throws on read and write", () => {
    const storage = makeThrowingStorage();
    render(
      <CollapsibleFilters viewId="x" storage={storage}>
        <div data-testid="body">chips</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("body")).toBeInTheDocument();
    // Click should not throw even though setItem will.
    fireEvent.click(screen.getByTestId("collapsible-filters-toggle"));
    expect(screen.queryByTestId("body")).toBeNull();
  });

  it("renders the badge slot when provided", () => {
    render(
      <CollapsibleFilters
        viewId="x"
        storage={null}
        badge={<span data-testid="badge-content">3</span>}
      >
        <div />
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("collapsible-filters-badge")).toBeInTheDocument();
    expect(screen.getByTestId("badge-content")).toHaveTextContent("3");
  });

  it("renders the actions slot even when collapsed", () => {
    const onClear = vi.fn();
    render(
      <CollapsibleFilters
        viewId="x"
        storage={null}
        actions={
          <button data-testid="action-btn" onClick={onClear}>
            Clear all
          </button>
        }
      >
        <div />
      </CollapsibleFilters>,
    );
    fireEvent.click(screen.getByTestId("collapsible-filters-toggle"));
    // Collapsed but actions still present + interactive.
    const btn = screen.getByTestId("action-btn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("uses a custom testId for the root + sub-parts", () => {
    render(
      <CollapsibleFilters
        viewId="x"
        storage={null}
        testId="my-filters"
        badge={<span>1</span>}
        actions={<span>act</span>}
      >
        <div data-testid="inside">x</div>
      </CollapsibleFilters>,
    );
    expect(screen.getByTestId("my-filters")).toBeInTheDocument();
    expect(screen.getByTestId("my-filters-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("my-filters-body")).toBeInTheDocument();
    expect(screen.getByTestId("my-filters-badge")).toBeInTheDocument();
    expect(screen.getByTestId("my-filters-actions")).toBeInTheDocument();
  });

  it("toggles data-collapsed attribute for css hooks", () => {
    render(
      <CollapsibleFilters viewId="x" storage={null}>
        <div />
      </CollapsibleFilters>,
    );
    const root = screen.getByTestId("collapsible-filters");
    expect(root).not.toHaveAttribute("data-collapsed");
    fireEvent.click(screen.getByTestId("collapsible-filters-toggle"));
    expect(root).toHaveAttribute("data-collapsed", "true");
  });
});
