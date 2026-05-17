import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { Project } from "../data/types";

function project(over: Partial<Project> = {}): Project {
  return {
    id: "PROJ-1",
    name: "Project One",
    description: null,
    key: null,
    enabled: 1,
    wiki_paths: [],
    cwds: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("ProjectSwitcher", () => {
  it("shows the active project label and the fallback when none is loaded", () => {
    const { rerender } = render(
      <ProjectSwitcher
        projects={[]}
        activeProjectId={null}
        onSelect={() => {}}
        fallbackLabel="Loading…"
      />,
    );
    expect(screen.getByTestId("project-switcher-button")).toHaveTextContent(
      "Loading…",
    );
    expect(screen.getByTestId("project-switcher-button")).toBeDisabled();

    rerender(
      <ProjectSwitcher
        projects={[project({ id: "PROJ-1", name: "Apple", key: "LM" })]}
        activeProjectId="PROJ-1"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId("project-switcher-button")).toHaveTextContent(
      "Apple · LM",
    );
  });

  it("opens the listbox on click and reports the selected id", () => {
    const onSelect = vi.fn();
    render(
      <ProjectSwitcher
        projects={[
          project({ id: "PROJ-1", name: "Alpha" }),
          project({ id: "PROJ-2", name: "Beta" }),
        ]}
        activeProjectId="PROJ-1"
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByTestId("project-switcher-list")).toBeNull();
    fireEvent.click(screen.getByTestId("project-switcher-button"));
    expect(screen.getByTestId("project-switcher-list")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("project-switcher-option-PROJ-2"));
    expect(onSelect).toHaveBeenCalledWith("PROJ-2");
    // List closes after selection.
    expect(screen.queryByTestId("project-switcher-list")).toBeNull();
  });

  it("ranks the active project first, then enabled, then disabled", () => {
    render(
      <ProjectSwitcher
        projects={[
          project({ id: "PROJ-D", name: "Disabled", enabled: 0 }),
          project({ id: "PROJ-A", name: "Alpha" }),
          project({ id: "PROJ-C", name: "Charlie" }),
        ]}
        activeProjectId="PROJ-C"
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("project-switcher-button"));
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.getAttribute("data-testid"))).toEqual([
      "project-switcher-option-PROJ-C",
      "project-switcher-option-PROJ-A",
      "project-switcher-option-PROJ-D",
    ]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("closes when Escape is pressed", () => {
    render(
      <ProjectSwitcher
        projects={[project()]}
        activeProjectId="PROJ-1"
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("project-switcher-button"));
    expect(screen.getByTestId("project-switcher-list")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("project-switcher-list")).toBeNull();
  });

  describe("+ New project (F1a)", () => {
    it("does not render the new-project entry when onCreateProject is omitted", () => {
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.queryByTestId("project-switcher-new")).toBeNull();
    });

    it("renders the new-project entry when onCreateProject is provided", () => {
      const onCreate = vi.fn(async () => project({ id: "PROJ-NEW" }));
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.getByTestId("project-switcher-new")).toBeInTheDocument();
    });

    it("opens the create modal and submits with required fields only", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn(async (input) =>
        project({
          id: "PROJ-NEW",
          name: input.name,
          enabled: 1,
        }),
      );
      const onSelect = vi.fn();
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={onSelect}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      expect(screen.getByTestId("project-create-modal")).toBeInTheDocument();
      await user.type(screen.getByTestId("project-create-name"), "demo");
      await user.click(screen.getByTestId("project-create-submit"));
      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledTimes(1);
      });
      expect(onCreate).toHaveBeenCalledWith({ name: "demo", enabled: 1 });
      // After successful creation the modal closes and the new project is
      // activated via onSelect.
      await waitFor(() =>
        expect(screen.queryByTestId("project-create-modal")).toBeNull(),
      );
      expect(onSelect).toHaveBeenCalledWith("PROJ-NEW");
    });

    it("submits the full optional payload (description / key / wiki_paths / cwds)", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn(async (input) => project({ id: "PROJ-NEW", ...input }));
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      await user.type(screen.getByTestId("project-create-name"), "alpha");
      await user.type(screen.getByTestId("project-create-key"), "AL");
      await user.type(
        screen.getByTestId("project-create-description"),
        "demo description",
      );
      await user.type(
        screen.getByTestId("project-create-wiki-paths"),
        "docs\nplans",
      );
      await user.type(
        screen.getByTestId("project-create-cwds"),
        "/Users/me/dev/alpha\n/Users/me/dev/alpha-app",
      );
      await user.click(screen.getByTestId("project-create-submit"));
      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith({
          name: "alpha",
          enabled: 1,
          key: "AL",
          description: "demo description",
          wiki_paths: ["docs", "plans"],
          cwds: ["/Users/me/dev/alpha", "/Users/me/dev/alpha-app"],
        }),
      );
    });

    it("disables Create until a name is entered", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      const submit = screen.getByTestId("project-create-submit");
      expect(submit).toBeDisabled();
      await user.type(screen.getByTestId("project-create-name"), "x");
      expect(submit).not.toBeDisabled();
    });

    it("cancel closes the modal without calling onCreateProject", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      await user.type(screen.getByTestId("project-create-name"), "discarded");
      await user.click(screen.getByTestId("project-create-cancel"));
      await waitFor(() =>
        expect(screen.queryByTestId("project-create-modal")).toBeNull(),
      );
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("Escape closes the modal without calling onCreateProject", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByTestId("project-create-modal")).toBeNull(),
      );
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("surfaces the daemon error message when onCreateProject rejects", async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn(async () => {
        throw new Error("name already exists");
      });
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onCreateProject={onCreate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-new"));
      await user.type(screen.getByTestId("project-create-name"), "dupe");
      await user.click(screen.getByTestId("project-create-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("project-create-error")).toHaveTextContent(
          "name already exists",
        ),
      );
      // Modal stays open so the user can retry.
      expect(screen.getByTestId("project-create-modal")).toBeInTheDocument();
    });

    it("button is enabled when projects=[] but create handler is provided", () => {
      render(
        <ProjectSwitcher
          projects={[]}
          activeProjectId={null}
          onSelect={() => {}}
          onCreateProject={vi.fn()}
          fallbackLabel="Loading…"
        />,
      );
      // Without onCreateProject the button is disabled; with it the user can
      // still open the dropdown to access "+ New project" even on first run.
      expect(screen.getByTestId("project-switcher-button")).not.toBeDisabled();
    });
  });

  describe("Project settings (F1b)", () => {
    it("does not render the settings entry without onUpdateProject", () => {
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.queryByTestId("project-switcher-settings")).toBeNull();
    });

    it("does not render the settings entry when no active project", () => {
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId={null}
          onSelect={() => {}}
          onUpdateProject={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.queryByTestId("project-switcher-settings")).toBeNull();
    });

    it("renders the settings entry when active project + onUpdateProject", () => {
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(
        screen.getByTestId("project-switcher-settings"),
      ).toBeInTheDocument();
    });

    it("opens the settings modal pre-populated with the active project", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[
            project({
              id: "PROJ-1",
              name: "Apple",
              description: "fruit",
              key: "AP",
              enabled: 1,
              wiki_paths: ["docs", "plans"],
              cwds: ["/a", "/b"],
            }),
          ]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      expect(screen.getByTestId("project-settings-modal")).toBeInTheDocument();
      expect(screen.getByTestId("project-settings-name")).toHaveValue("Apple");
      expect(screen.getByTestId("project-settings-key")).toHaveValue("AP");
      expect(screen.getByTestId("project-settings-description")).toHaveValue(
        "fruit",
      );
      expect(screen.getByTestId("project-settings-wiki-paths")).toHaveValue(
        "docs\nplans",
      );
      expect(screen.getByTestId("project-settings-cwds")).toHaveValue("/a\n/b");
      expect(screen.getByTestId("project-settings-enabled")).toBeChecked();
      expect(screen.getByTestId("project-settings-id")).toHaveTextContent(
        "PROJ-1",
      );
    });

    it("submits only the changed fields (description edit)", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async (_id, patch) =>
        project({ id: "PROJ-1", ...patch }),
      );
      render(
        <ProjectSwitcher
          projects={[
            project({
              id: "PROJ-1",
              name: "Apple",
              description: "old",
              key: "AP",
              wiki_paths: ["docs"],
              cwds: ["/a"],
            }),
          ]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      const desc = screen.getByTestId("project-settings-description");
      await user.clear(desc);
      await user.type(desc, "new description");
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith("PROJ-1", {
          description: "new description",
        });
      });
      await waitFor(() =>
        expect(screen.queryByTestId("project-settings-modal")).toBeNull(),
      );
    });

    it("toggles enabled off and sends enabled=0", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async (_id, patch) =>
        project({ id: "PROJ-1", ...patch }),
      );
      render(
        <ProjectSwitcher
          projects={[project({ id: "PROJ-1", enabled: 1 })]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.click(screen.getByTestId("project-settings-enabled"));
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith("PROJ-1", { enabled: 0 }),
      );
    });

    it("edits the cwds list (add + remove)", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async (_id, patch) =>
        project({ id: "PROJ-1", ...patch }),
      );
      render(
        <ProjectSwitcher
          projects={[
            project({
              id: "PROJ-1",
              cwds: ["/Users/me/dev/old"],
            }),
          ]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      const cwds = screen.getByTestId("project-settings-cwds");
      await user.clear(cwds);
      await user.type(cwds, "/Users/me/dev/alpha\n/Users/me/dev/beta");
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith("PROJ-1", {
          cwds: ["/Users/me/dev/alpha", "/Users/me/dev/beta"],
        }),
      );
    });

    it("clears the description when emptied (null patch)", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async (_id, patch) =>
        project({ id: "PROJ-1", ...patch }),
      );
      render(
        <ProjectSwitcher
          projects={[
            project({ id: "PROJ-1", description: "existing description" }),
          ]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.clear(screen.getByTestId("project-settings-description"));
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith("PROJ-1", { description: null }),
      );
    });

    it("submits an empty patch when nothing changed", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async (_id, patch) =>
        project({ id: "PROJ-1", ...patch }),
      );
      render(
        <ProjectSwitcher
          projects={[project({ id: "PROJ-1", name: "Apple" })]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("PROJ-1", {}));
    });

    it("disables save when name is cleared", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[project({ id: "PROJ-1", name: "Apple" })]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.clear(screen.getByTestId("project-settings-name"));
      expect(screen.getByTestId("project-settings-submit")).toBeDisabled();
    });

    it("cancel closes the modal without calling onUpdateProject", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.type(
        screen.getByTestId("project-settings-description"),
        "discarded",
      );
      await user.click(screen.getByTestId("project-settings-cancel"));
      await waitFor(() =>
        expect(screen.queryByTestId("project-settings-modal")).toBeNull(),
      );
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("surfaces the daemon error message when onUpdateProject rejects", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(async () => {
        throw new Error("permission denied");
      });
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
          onUpdateProject={onUpdate}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.click(screen.getByTestId("project-switcher-settings"));
      await user.type(
        screen.getByTestId("project-settings-description"),
        " edit",
      );
      await user.click(screen.getByTestId("project-settings-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("project-settings-error")).toHaveTextContent(
          "permission denied",
        ),
      );
      expect(screen.getByTestId("project-settings-modal")).toBeInTheDocument();
    });
  });

  describe("Search (F1c — web parity)", () => {
    it("renders the search input when the dropdown opens", () => {
      render(
        <ProjectSwitcher
          projects={[project({ id: "PROJ-1", name: "Alpha" })]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      expect(screen.queryByTestId("project-switcher-search")).toBeNull();
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.getByTestId("project-switcher-search")).toBeInTheDocument();
    });

    it("auto-focuses the search input when the dropdown opens", async () => {
      render(
        <ProjectSwitcher
          projects={[project()]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await waitFor(() =>
        expect(screen.getByTestId("project-switcher-search")).toHaveFocus(),
      );
    });

    it("filters by name (case-insensitive substring)", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[
            project({ id: "PROJ-A", name: "Apple" }),
            project({ id: "PROJ-B", name: "Banana" }),
            project({ id: "PROJ-P", name: "Pineapple" }),
          ]}
          activeProjectId="PROJ-A"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.type(screen.getByTestId("project-switcher-search"), "APPLE");
      expect(
        screen.getByTestId("project-switcher-option-PROJ-A"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("project-switcher-option-PROJ-P"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("project-switcher-option-PROJ-B"),
      ).toBeNull();
    });

    it("filters by description and by cwd path", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[
            project({
              id: "PROJ-1",
              name: "First",
              description: "Tracks the alpha workstream",
              cwds: ["/Users/me/dev/first"],
            }),
            project({
              id: "PROJ-2",
              name: "Second",
              description: "Beta projects",
              cwds: ["/Users/me/dev/alpha-beta"],
            }),
            project({
              id: "PROJ-3",
              name: "Third",
              description: "Unrelated",
              cwds: ["/Users/me/dev/third"],
            }),
          ]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      // PROJ-1 matches via description ("alpha workstream"), PROJ-2 matches
      // via cwd path ("alpha-beta"), PROJ-3 matches nothing.
      await user.type(screen.getByTestId("project-switcher-search"), "alpha");
      expect(
        screen.getByTestId("project-switcher-option-PROJ-1"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("project-switcher-option-PROJ-2"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("project-switcher-option-PROJ-3"),
      ).toBeNull();
    });

    it("shows 'No matches' when no project matches the query", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[project({ id: "PROJ-1", name: "Apple" })]}
          activeProjectId="PROJ-1"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.type(screen.getByTestId("project-switcher-search"), "xyz");
      expect(screen.getByTestId("project-switcher-empty")).toHaveTextContent(
        "No matches",
      );
    });

    it("shows 'No projects yet' when projects=[] but dropdown is opened via onCreateProject", () => {
      render(
        <ProjectSwitcher
          projects={[]}
          activeProjectId={null}
          onSelect={() => {}}
          onCreateProject={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.getByTestId("project-switcher-empty")).toHaveTextContent(
        "No projects yet",
      );
    });

    it("resets the query when the dropdown is closed and reopened", async () => {
      const user = userEvent.setup();
      render(
        <ProjectSwitcher
          projects={[
            project({ id: "PROJ-A", name: "Alpha" }),
            project({ id: "PROJ-B", name: "Beta" }),
          ]}
          activeProjectId="PROJ-A"
          onSelect={() => {}}
        />,
      );
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      await user.type(screen.getByTestId("project-switcher-search"), "alpha");
      expect(
        screen.queryByTestId("project-switcher-option-PROJ-B"),
      ).toBeNull();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("project-switcher-list")).toBeNull();
      fireEvent.click(screen.getByTestId("project-switcher-button"));
      expect(screen.getByTestId("project-switcher-search")).toHaveValue("");
      expect(
        screen.getByTestId("project-switcher-option-PROJ-A"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("project-switcher-option-PROJ-B"),
      ).toBeInTheDocument();
    });
  });
});
