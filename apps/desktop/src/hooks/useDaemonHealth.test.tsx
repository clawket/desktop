import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { DataProvider } from "../data/DataProvider";
import { useDaemonHealth } from "./useDaemonHealth";
import type { DaemonClient } from "../data/api";

function makeClient(healthSequence: boolean[]): DaemonClient {
  let i = 0;
  return {
    listProjects: vi.fn(async () => [
      {
        id: "PROJ-1",
        name: "Test Project",
        description: null,
        key: null,
        enabled: 1,
        wiki_paths: [],
        cwds: [],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]),
    listPlans: vi.fn(async () => []),
    listUnits: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listKnowledge: vi.fn(async () => []),
    listTimeline: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listWikiFiles: vi.fn(async () => []),
    health: vi.fn(async () => {
      const v = healthSequence[Math.min(i, healthSequence.length - 1)];
      i += 1;
      return v;
    }),
    invalidateToken: vi.fn(),
    baseUrl: "http://127.0.0.1:19400",
  } as unknown as DaemonClient;
}

function Probe({
  onStatusChange,
  intervalMs = 30,
}: {
  onStatusChange?: (ok: boolean) => void;
  intervalMs?: number;
}) {
  const { connected, reconnect } = useDaemonHealth({
    intervalMs,
    onStatusChange,
  });
  return (
    <>
      <span data-testid="probe-connected">{connected ? "ok" : "down"}</span>
      <button
        type="button"
        data-testid="probe-reconnect"
        onClick={reconnect}
      >
        reconnect
      </button>
    </>
  );
}

describe("useDaemonHealth", () => {
  it("reports connected=true after the initial poll resolves true", async () => {
    const client = makeClient([true]);
    render(
      <DataProvider projectId="PROJ-1" client={client} disableSse>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe-connected")).toHaveTextContent("ok"),
    );
  });

  it("flips to down on a failing poll and fires onStatusChange once per flip", async () => {
    const client = makeClient([true, false, false]);
    const onStatusChange = vi.fn();
    render(
      <DataProvider projectId="PROJ-1" client={client} disableSse>
        <Probe onStatusChange={onStatusChange} />
      </DataProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe-connected")).toHaveTextContent("ok"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe-connected")).toHaveTextContent("down"),
    );
    // ensure no extra flip-callback fires when subsequent polls stay false
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(onStatusChange).toHaveBeenCalledTimes(2);
    expect(onStatusChange.mock.calls[0]).toEqual([true]);
    expect(onStatusChange.mock.calls[1]).toEqual([false]);
  });
});
