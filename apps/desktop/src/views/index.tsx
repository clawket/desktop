import type { ReactNode } from "react";
import type { ViewId } from "../shell/views";
import { SummaryView } from "./SummaryView";
import { BoardView } from "./BoardView";
import { BacklogView } from "./BacklogView";
import { TimelineView } from "./TimelineView";
import { WikiView } from "./WikiView";

const VIEW_COMPONENTS: Record<ViewId, () => ReactNode> = {
  summary: SummaryView,
  board: BoardView,
  backlog: BacklogView,
  timeline: TimelineView,
  wiki: WikiView,
};

export function renderView(id: ViewId): ReactNode {
  const Component = VIEW_COMPONENTS[id];
  return <Component />;
}
