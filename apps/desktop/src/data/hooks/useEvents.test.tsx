import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { parseEventName, useEvents, type DaemonEvent } from "./useEvents";

// Test double for the platform EventSource. We hand-fire open/error/named
// events so we can exercise the hook's reducer surface without a real server.
class FakeEventSource {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 2;
  readonly url: string;
  readonly withCredentials: boolean;
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  private listeners = new Map<string, Set<EventListener>>();
  static instances: FakeEventSource[] = [];

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, cb: EventListener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(cb);
  }
  removeEventListener(name: string, cb: EventListener) {
    this.listeners.get(name)?.delete(cb);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  fire(name: string, data?: unknown, lastEventId?: string) {
    const ev = new MessageEvent(name, {
      data: data === undefined ? "" : JSON.stringify(data),
      lastEventId: lastEventId ?? "",
    });
    this.listeners.get(name)?.forEach((cb) => cb(ev));
  }
  fireOpen() {
    this.readyState = FakeEventSource.OPEN;
    this.listeners.get("open")?.forEach((cb) => cb(new Event("open")));
  }
  fireError() {
    this.listeners.get("error")?.forEach((cb) => cb(new Event("error")));
  }
}

describe("parseEventName", () => {
  it.each([
    ["task:created", { entity: "task", change: "created" }],
    ["cycle:updated", { entity: "cycle", change: "updated" }],
    ["plan:deleted", { entity: "plan", change: "deleted" }],
    ["knowledge:updated", { entity: "knowledge", change: "updated" }],
    ["comment:created", { entity: "comment", change: "created" }],
    ["task:started", { entity: "task", change: "started" }],
    ["malformed", { entity: "unknown", change: "unknown" }],
    ["foo:bar", { entity: "unknown", change: "unknown" }],
  ])("parses %s", (input, expected) => {
    expect(parseEventName(input)).toEqual(expected);
  });
});

describe("useEvents", () => {
  it("opens an EventSource at <base>/events and tracks readyState", async () => {
    FakeEventSource.instances = [];

    const { result } = renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      }),
    );

    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe("http://127.0.0.1:19400/events");
    expect(es.withCredentials).toBe(true);
    expect(result.current.readyState).toBe("connecting");

    act(() => es.fireOpen());
    await waitFor(() => {
      expect(result.current.readyState).toBe("open");
    });
  });

  it("appends entity_types filter when provided", async () => {
    FakeEventSource.instances = [];

    renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        entityTypes: ["task", "cycle"],
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      }),
    );

    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    expect(FakeEventSource.instances[0]!.url).toBe(
      "http://127.0.0.1:19400/events?entity_types=task%2Ccycle",
    );
  });

  it("delivers parsed events to onEvent and updates lastEventId", async () => {
    FakeEventSource.instances = [];
    const received: DaemonEvent[] = [];

    const { result } = renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
        onEvent: (e) => received.push(e),
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());

    act(() => es.fire("task:updated", { id: "TASK-1", status: "done" }, "42"));
    act(() => es.fire("knowledge:created", { id: "ART-1" }, "43"));

    await waitFor(() => {
      expect(received).toHaveLength(2);
      expect(result.current.lastEventId).toBe("43");
    });
    expect(received[0]).toMatchObject({
      event: "task:updated",
      entity: "task",
      change: "updated",
      id: "42",
      data: { id: "TASK-1", status: "done" },
    });
    expect(received[1]!.entity).toBe("knowledge");
  });

  it("surfaces errors as readyState=connecting + error string", async () => {
    FakeEventSource.instances = [];

    const { result } = renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());
    await waitFor(() => expect(result.current.readyState).toBe("open"));

    act(() => es.fireError());
    await waitFor(() => {
      expect(result.current.readyState).toBe("connecting");
      expect(result.current.error).toBe("SSE connection error");
    });
  });

  it("closes the EventSource on unmount", async () => {
    FakeEventSource.instances = [];

    const { unmount } = renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    unmount();
    expect(es.closed).toBe(true);
  });

  it("integrates with a reducer-style consumer (smoke)", async () => {
    FakeEventSource.instances = [];

    function Consumer() {
      const [count, setCount] = useState(0);
      const state = useEvents({
        baseUrl: "http://127.0.0.1:19400",
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
        onEvent: (e) => {
          if (e.entity === "task") setCount((c) => c + 1);
        },
      });
      // Force at least one render that depends on `state` so coverage of the
      // returned shape is exercised in the consumer.
      useEffect(() => {}, [state.readyState]);
      return <div data-testid="count">{count}</div>;
    }

    const { getByTestId } = render(<Consumer />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    act(() => es.fireOpen());
    act(() => es.fire("task:created", { id: "TASK-1" }, "1"));
    act(() => es.fire("task:updated", { id: "TASK-1" }, "2"));
    act(() => es.fire("knowledge:created", { id: "ART-1" }, "3"));

    await waitFor(() => {
      expect(getByTestId("count").textContent).toBe("2");
    });
  });

  it("does not subscribe when disabled", async () => {
    FakeEventSource.instances = [];

    renderHook(() =>
      useEvents({
        baseUrl: "http://127.0.0.1:19400",
        disabled: true,
        eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      }),
    );

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("uses an injected EventSource constructor (no global polyfill required)", async () => {
    // jsdom does not implement EventSource. Sanity-check that we never hit
    // globalThis.EventSource by passing the fake explicitly.
    FakeEventSource.instances = [];
    const original = (
      globalThis as { EventSource?: typeof EventSource }
    ).EventSource;
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
    try {
      const { result } = renderHook(() =>
        useEvents({
          baseUrl: "http://127.0.0.1:19400",
          eventSourceImpl: FakeEventSource as unknown as typeof EventSource,
        }),
      );
      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
      expect(result.current.readyState).toBe("connecting");
    } finally {
      if (original)
        (globalThis as { EventSource?: typeof EventSource }).EventSource =
          original;
    }
  });
});
