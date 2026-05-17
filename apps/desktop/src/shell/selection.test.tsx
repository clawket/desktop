import { describe, it, expect } from "vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SelectionProvider,
  useClearSelectionOnProjectChange,
  useSelection,
} from "./selection";

function Harness({ initialProject }: { initialProject: string | null }) {
  const [projectId, setProjectId] = useState<string | null>(initialProject);
  useClearSelectionOnProjectChange(projectId);
  const { selectedId, selectedKind, select } = useSelection();
  return (
    <>
      <button
        data-testid="select-plan"
        onClick={() => select("PLAN-X", "plan")}
      >
        select
      </button>
      <button
        data-testid="switch-project-b"
        onClick={() => setProjectId("PROJ-B")}
      >
        switch B
      </button>
      <button
        data-testid="switch-project-a"
        onClick={() => setProjectId("PROJ-A")}
      >
        switch A
      </button>
      <button
        data-testid="switch-project-null"
        onClick={() => setProjectId(null)}
      >
        switch null
      </button>
      <div data-testid="state">
        {selectedKind ?? "none"}:{selectedId ?? "none"}
      </div>
    </>
  );
}

describe("useClearSelectionOnProjectChange", () => {
  it("preserves selection when the project does not change", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <Harness initialProject="PROJ-A" />
      </SelectionProvider>,
    );
    await user.click(screen.getByTestId("select-plan"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
    // Re-rendering with the same projectId must NOT clear selection.
    await user.click(screen.getByTestId("switch-project-a"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
  });

  it("clears selection when active project changes (B2 regression)", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <Harness initialProject="PROJ-A" />
      </SelectionProvider>,
    );
    await user.click(screen.getByTestId("select-plan"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
    await user.click(screen.getByTestId("switch-project-b"));
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
  });

  it("clears selection when active project transitions to null", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <Harness initialProject="PROJ-A" />
      </SelectionProvider>,
    );
    await user.click(screen.getByTestId("select-plan"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
    await user.click(screen.getByTestId("switch-project-null"));
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
  });

  it("does not clear on the initial null → loaded transition", async () => {
    // When DataProvider mounts, activeProjectId starts at null and becomes
    // the loaded ID after fetch. Selection is null at mount; the effect must
    // not redundantly clear (no observable issue, but exercises the skip
    // logic that prevents a false-positive clear loop with stale state).
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <Harness initialProject={null} />
      </SelectionProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
    // Now simulate the post-init "first valid project arrives" transition.
    await user.click(screen.getByTestId("switch-project-a"));
    // After this first transition there's still no selection seeded; that's
    // expected. Now seed a selection and confirm a subsequent switch clears.
    await user.click(screen.getByTestId("select-plan"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
    await user.click(screen.getByTestId("switch-project-b"));
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
  });

  it("re-clears on every subsequent project switch", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <Harness initialProject="PROJ-A" />
      </SelectionProvider>,
    );
    await user.click(screen.getByTestId("select-plan"));
    await user.click(screen.getByTestId("switch-project-b"));
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");

    // Select again in the new project; switching back to PROJ-A should clear.
    await user.click(screen.getByTestId("select-plan"));
    expect(screen.getByTestId("state")).toHaveTextContent("plan:PLAN-X");
    await user.click(screen.getByTestId("switch-project-a"));
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
  });

  it("acts on the actual project transition, not just the render", () => {
    // Direct render with a non-null initial project should not retroactively
    // clear an existing (in this case nonexistent) selection. Using act +
    // direct rerender verifies the skip-first invariant deterministically.
    const { rerender } = render(
      <SelectionProvider>
        <Harness initialProject="PROJ-A" />
      </SelectionProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
    act(() => {
      rerender(
        <SelectionProvider>
          <Harness initialProject="PROJ-A" />
        </SelectionProvider>,
      );
    });
    expect(screen.getByTestId("state")).toHaveTextContent("none:none");
  });
});
