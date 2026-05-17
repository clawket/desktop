// React hook over the daemon's GET /events SSE stream.
//
// Wire contract (daemon/src/routes/events.rs + state.rs::parse_event_name):
//   - Each event has `id: <u64>`, `event: "<entity>:<change>"`, `data: <json>`.
//   - Known entity:change pairs:
//       task:{created,updated,deleted,started,done,cancelled}
//       cycle:{created,updated,deleted}
//       plan:{created,updated,deleted}
//       unit:{created,updated,deleted}
//       knowledge:{created,updated,deleted}
//       comment:{created,deleted}
//       ping (keep-alive)
//   - Last-Event-ID: the daemon honors the standard `Last-Event-ID` header
//     that EventSource sends automatically on reconnect (set from the most
//     recent `id:` line). We don't need to pass it manually — EventSource
//     does it for us. We *do* surface the last seen id to callers so they
//     can pair SSE with replay/initial fetch.
//
// Auth note: EventSource cannot set custom headers, which is why TCP auth
// also accepts the `clawket_session` cookie (daemon/src/middleware/tcp_auth.rs).
// In v3 the renderer is local-only over 127.0.0.1; once the cookie is set on
// first authenticated request it carries over. For now we accept that the
// SSE endpoint may also tolerate token-via-query if the daemon allows it —
// see follow-up note in the task evidence.

import { useEffect, useRef, useState } from "react";
import { resolveBaseUrl } from "../api";

export type SseEntityType =
  | "task"
  | "cycle"
  | "plan"
  | "unit"
  | "knowledge"
  | "comment"
  | "unknown";

export type SseChangeType =
  | "created"
  | "updated"
  | "deleted"
  | "started"
  | "done"
  | "cancelled"
  | "unknown";

export interface DaemonEvent {
  /** Monotonic numeric id from the daemon's broadcast channel. */
  id: string;
  /** Wire event name in `entity:change` form. */
  event: string;
  entity: SseEntityType;
  change: SseChangeType;
  /** Parsed JSON payload of the event. */
  data: unknown;
}

export interface UseEventsOptions {
  /** Comma-separated daemon entity_types filter. */
  entityTypes?: SseEntityType[];
  /** Override base URL (defaults to resolveBaseUrl()). */
  baseUrl?: string;
  /** Optional EventSource constructor (test injection point). */
  eventSourceImpl?: typeof EventSource;
  /** Fired for every parsed event (post-filter). */
  onEvent?: (ev: DaemonEvent) => void;
  /** Disable the subscription. */
  disabled?: boolean;
}

export interface UseEventsState {
  readyState: "connecting" | "open" | "closed";
  lastEventId: string | null;
  /** Set when the most recent connect attempt failed. */
  error: string | null;
}

/** Split "entity:change" with sane fallbacks for unknown event names. */
export function parseEventName(name: string): {
  entity: SseEntityType;
  change: SseChangeType;
} {
  const idx = name.indexOf(":");
  if (idx < 0) {
    return { entity: "unknown", change: "unknown" };
  }
  const entity = name.slice(0, idx);
  const change = name.slice(idx + 1);
  const ENTITIES: SseEntityType[] = [
    "task",
    "cycle",
    "plan",
    "unit",
    "knowledge",
    "comment",
  ];
  const CHANGES: SseChangeType[] = [
    "created",
    "updated",
    "deleted",
    "started",
    "done",
    "cancelled",
  ];
  return {
    entity: (ENTITIES as string[]).includes(entity)
      ? (entity as SseEntityType)
      : "unknown",
    change: (CHANGES as string[]).includes(change)
      ? (change as SseChangeType)
      : "unknown",
  };
}

const KNOWN_EVENT_NAMES = [
  "task:created",
  "task:updated",
  "task:deleted",
  "task:started",
  "task:done",
  "task:cancelled",
  "cycle:created",
  "cycle:updated",
  "cycle:deleted",
  "plan:created",
  "plan:updated",
  "plan:deleted",
  "unit:created",
  "unit:updated",
  "unit:deleted",
  "knowledge:created",
  "knowledge:updated",
  "knowledge:deleted",
  "comment:created",
  "comment:deleted",
] as const;

/**
 * Subscribe to /events SSE. Returns connection state + lastEventId.
 *
 * Reconnection is delegated to the platform EventSource (it retries
 * automatically). When the browser drops the connection it sends the last
 * `id:` it saw as `Last-Event-ID`, so the daemon could (in principle) replay
 * missed events. Today the daemon emits new events only — replay goes through
 * the separate `/events/replay` endpoint — so callers should re-fetch their
 * entity lists on `readyState === "open"` to catch up on anything they
 * missed during the outage.
 */
export function useEvents(opts: UseEventsOptions = {}): UseEventsState {
  const [state, setState] = useState<UseEventsState>({
    readyState: "connecting",
    lastEventId: null,
    error: null,
  });

  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Identity key for the subscription: re-subscribe only when these change.
  // Content shifts to onEvent/entityTypes are captured via optsRef, but the
  // entity_types query string is fixed per connection, so its content key
  // does belong in the dependency array.
  const entityTypesKey = opts.entityTypes?.join(",");
  const { disabled, baseUrl, eventSourceImpl } = opts;

  useEffect(() => {
    if (disabled) {
      setState({ readyState: "closed", lastEventId: null, error: null });
      return;
    }

    const Impl: typeof EventSource =
      eventSourceImpl ??
      (globalThis as unknown as { EventSource?: typeof EventSource })
        .EventSource!;
    if (!Impl) {
      setState({
        readyState: "closed",
        lastEventId: null,
        error: "EventSource is not available in this environment",
      });
      return;
    }

    const base = (baseUrl ?? resolveBaseUrl()).replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (entityTypesKey && entityTypesKey.length > 0) {
      params.set("entity_types", entityTypesKey);
    }
    const qs = params.toString();
    const url = `${base}/events${qs ? `?${qs}` : ""}`;

    let cancelled = false;
    const es = new Impl(url, { withCredentials: true });

    const onOpen = () => {
      if (cancelled) return;
      setState((s) => ({ ...s, readyState: "open", error: null }));
    };
    const onError = () => {
      if (cancelled) return;
      // EventSource auto-reconnects; surface the transient state.
      setState((s) => ({
        ...s,
        readyState: "connecting",
        error: "SSE connection error",
      }));
    };

    const handleNamed = (e: MessageEvent) => {
      if (cancelled) return;
      const eventName = (e as MessageEvent & { type: string }).type;
      const { entity, change } = parseEventName(eventName);
      let parsed: unknown = null;
      try {
        parsed = e.data ? JSON.parse(e.data as string) : null;
      } catch {
        parsed = e.data;
      }
      const id = e.lastEventId || "";
      const ev: DaemonEvent = {
        id,
        event: eventName,
        entity,
        change,
        data: parsed,
      };
      if (id) {
        setState((s) =>
          s.lastEventId === id ? s : { ...s, lastEventId: id },
        );
      }
      optsRef.current.onEvent?.(ev);
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    for (const name of KNOWN_EVENT_NAMES) {
      es.addEventListener(name, handleNamed as EventListener);
    }

    return () => {
      cancelled = true;
      for (const name of KNOWN_EVENT_NAMES) {
        es.removeEventListener(name, handleNamed as EventListener);
      }
      es.removeEventListener("open", onOpen);
      es.removeEventListener("error", onError);
      es.close();
      setState((s) => ({ ...s, readyState: "closed" }));
    };
    // Re-subscribe only when these identity-defining inputs change. onEvent
    // content shifts are captured via optsRef.
  }, [disabled, baseUrl, eventSourceImpl, entityTypesKey]);

  return state;
}
