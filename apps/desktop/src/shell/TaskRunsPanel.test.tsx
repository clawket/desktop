import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TaskRunsPanel } from "./TaskRunsPanel";
import type { Run } from "../data/types";

function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: "RUN-1",
    task_id: "TASK-1",
    session_id: null,
    agent: "claude-code",
    started_at: "2026-05-14T10:00:00.000Z",
    ended_at: "2026-05-14T10:00:42.000Z",
    result: "success",
    notes: null,
    status: "finished",
    ...over,
  };
}

describe("TaskRunsPanel", () => {
  it("renders loading then the run list, fetching by taskId", async () => {
    const onList = vi.fn(async () => [makeRun()]);
    render(<TaskRunsPanel taskId="TASK-1" onList={onList} />);
    expect(
      screen.getByTestId("task-detail-runs-loading"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-run-RUN-1")).toBeInTheDocument(),
    );
    expect(onList).toHaveBeenCalledWith("TASK-1");
  });

  it("renders empty state when no runs", async () => {
    render(<TaskRunsPanel taskId="TASK-1" onList={async () => []} />);
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-runs-empty"),
      ).toBeInTheDocument(),
    );
  });

  it("sorts runs newest first by started_at", async () => {
    const older = makeRun({
      id: "RUN-OLD",
      started_at: "2026-05-13T08:00:00.000Z",
    });
    const newer = makeRun({
      id: "RUN-NEW",
      started_at: "2026-05-14T08:00:00.000Z",
    });
    render(
      <TaskRunsPanel
        taskId="TASK-1"
        onList={async () => [older, newer]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-run-RUN-NEW")).toBeInTheDocument(),
    );
    const items = screen.getAllByTestId(/^task-detail-run-RUN-/);
    expect(items[0]!.getAttribute("data-testid")).toBe(
      "task-detail-run-RUN-NEW",
    );
    expect(items[1]!.getAttribute("data-testid")).toBe(
      "task-detail-run-RUN-OLD",
    );
  });

  it("renders status, result, agent, and notes when present", async () => {
    render(
      <TaskRunsPanel
        taskId="TASK-1"
        onList={async () => [
          makeRun({
            status: "started",
            result: null,
            ended_at: null,
            notes: "still running",
          }),
        ]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-detail-run-RUN-1")).toBeInTheDocument(),
    );
    const item = screen.getByTestId("task-detail-run-RUN-1");
    expect(item).toHaveTextContent("started");
    expect(item).toHaveTextContent("claude-code");
    expect(item).toHaveTextContent("ongoing");
    expect(item).toHaveTextContent("still running");
  });

  it("surfaces fetch errors via the error region", async () => {
    const onList = vi.fn(async () => {
      throw new Error("kaboom");
    });
    render(<TaskRunsPanel taskId="TASK-1" onList={onList} />);
    await waitFor(() =>
      expect(
        screen.getByTestId("task-detail-runs-error"),
      ).toHaveTextContent("kaboom"),
    );
  });
});
