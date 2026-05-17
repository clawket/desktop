import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import { CommandSurface, type CommandItem } from "./CommandSurface";
import { Button } from "../Button/Button";

const ALL_ITEMS: CommandItem[] = [
  { id: "view:summary", label: "Open Summary view", hint: "⌘1", group: "Views" },
  { id: "view:plans", label: "Open Plans view", hint: "⌘2", group: "Views" },
  { id: "view:board", label: "Open Board view", hint: "⌘3", group: "Views" },
  { id: "view:backlog", label: "Open Backlog view", hint: "⌘4", group: "Views" },
  { id: "view:timeline", label: "Open Timeline view", hint: "⌘5", group: "Views" },
  { id: "view:wiki", label: "Open Wiki view", hint: "⌘6", group: "Views" },
  { id: "t1", ticket: "LM-10878", label: "AppShell", group: "Tasks" },
  { id: "t2", ticket: "LM-10879", label: "PlanTree", group: "Tasks" },
  { id: "t3", ticket: "LM-10880", label: "TaskCard", group: "Tasks" },
  { id: "t4", ticket: "LM-10881", label: "TaskDetail", group: "Tasks" },
  { id: "t5", ticket: "LM-10882", label: "CommandSurface", group: "Tasks" },
  { id: "act:new-task", label: "Create new task…", hint: "N", group: "Actions" },
  { id: "act:approve", label: "Approve current unit", group: "Actions" },
];

const meta = {
  title: "Layout/CommandSurface",
  component: CommandSurface,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    items: [],
    query: "",
    onQueryChange: () => undefined,
    onSelect: () => undefined,
    onClose: () => undefined,
  },
} satisfies Meta<typeof CommandSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function DefaultStory() {
    const [open, setOpen] = useState(true);
    const [query, setQuery] = useState("");
    const items = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return ALL_ITEMS;
      return ALL_ITEMS.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.ticket?.toLowerCase().includes(q),
      );
    }, [query]);
    return (
      <div className="h-screen w-full bg-background text-foreground">
        <div className="p-6">
          <Button variant="ghost" onClick={() => setOpen(true)}>
            Open palette (⌘K)
          </Button>
        </div>
        <CommandSurface
          open={open}
          items={items}
          query={query}
          onQueryChange={setQuery}
          onSelect={(item) => {
            console.log("selected", item);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};

export const EmptyState: Story = {
  render: () => (
    <div className="h-screen w-full bg-background text-foreground">
      <CommandSurface
        open
        items={[]}
        query="zzz-no-match"
        onQueryChange={() => undefined}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    </div>
  ),
};
