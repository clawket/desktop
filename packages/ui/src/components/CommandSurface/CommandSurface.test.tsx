import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandSurface, type CommandItem } from "./CommandSurface";

const ITEMS: CommandItem[] = [
  { id: "a", label: "Alpha", ticket: "LM-1", group: "Tasks" },
  { id: "b", label: "Bravo", ticket: "LM-2", group: "Tasks" },
  { id: "c", label: "Charlie", group: "Actions" },
];

function noop() {}

describe("CommandSurface", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandSurface
        open={false}
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the search input and result list when open", () => {
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("groups results by item.group", () => {
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("fires onQueryChange while typing in the search box", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={onQueryChange}
        onSelect={noop}
        onClose={noop}
      />,
    );
    const input = screen.getByPlaceholderText(/Type a command/);
    await user.type(input, "al");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("highlights the first item by default and moves with ArrowDown", () => {
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps ArrowUp from the first item to the last", () => {
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowUp" });
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects the active item on Enter", () => {
    const onSelect = vi.fn();
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={onSelect}
        onClose={noop}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it("invokes onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CommandSurface
        open
        items={ITEMS}
        query=""
        onQueryChange={noop}
        onSelect={noop}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByLabelText("Close command palette"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders an empty message when items is empty", () => {
    render(
      <CommandSurface
        open
        items={[]}
        query="zzz"
        onQueryChange={noop}
        onSelect={noop}
        onClose={noop}
        emptyMessage="No matches"
      />,
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});
