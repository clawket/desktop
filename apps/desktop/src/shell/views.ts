export const VIEW_IDS = [
  "summary",
  "board",
  "backlog",
  "timeline",
  "wiki",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export interface ViewMeta {
  id: ViewId;
  label: string;
  hint: string;
}

export const VIEWS: readonly ViewMeta[] = [
  { id: "summary", label: "Summary", hint: "Daily standup landing" },
  { id: "board", label: "Board", hint: "Kanban by status" },
  { id: "backlog", label: "Backlog", hint: "Filterable task queue" },
  { id: "timeline", label: "Timeline", hint: "Event stream replay" },
  { id: "wiki", label: "Wiki", hint: "Project markdown reader" },
];
