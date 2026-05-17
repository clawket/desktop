# SSE partial-update patterns

Snapshot: 2026-05-14. This document is a runbook for a view author who needs to
keep their view in sync with daemon state. The desktop renderer has one source
of truth (`DataProvider`) and one update strategy — do not invent a parallel
path.

## 1. The two patterns in use

`DataProvider` (`apps/desktop/src/data/DataProvider.tsx:275-286`) reacts to
every SSE event by branching on the `change` field of the event name.

### Pattern A — Structural refetch

For `*:created`, `*:updated`, `*:started`, `*:done`, `*:cancelled`, the
provider re-pulls the entity list from the daemon and replaces the cached
array via `UPSERT_*` actions.

```ts
// DataProvider.tsx:225-273
async function refetchAfter(entity: SseEntityType): Promise<void> {
  const c = clientRef.current;
  switch (entity) {
    case "plan":
      dispatch({ type: "UPSERT_PLANS",  items: await c.listPlans(projectId) });
      break;
    case "unit":
      dispatch({ type: "UPSERT_UNITS",  items: await c.listUnits() });
      break;
    case "cycle":
      dispatch({ type: "UPSERT_CYCLES", items: await c.listCycles({ projectId }) });
      break;
    case "task":
      dispatch({ type: "UPSERT_TASKS",  items: await c.listTasks() });
      break;
    case "knowledge":
      dispatch({ type: "UPSERT_KNOWLEDGE", items: await c.listKnowledge({ projectId }) });
      break;
    // ...
  }
  if (projectId && entity !== "comment") {
    dispatch({
      type: "UPSERT_TIMELINE",
      items: await c.listTimeline(projectId, { limit: 200 }),
    });
  }
}
```

Timeline is refreshed on every entity change (except `comment:*`, which folds
into the timeline refresh on its own arm of the switch) because timeline
events are derived from all the underlying mutations.

### Pattern B — Local remove

For `*:deleted`, the provider does **not** refetch. It splices the entity out
of its cached list using the `REMOVE` action.

```ts
// DataProvider.tsx:275-286
return (ev: DaemonEvent) => {
  const { entity, change } = parseEventName(ev.event);
  const id =
    ev.data && typeof ev.data === "object" && "id" in ev.data
      ? String((ev.data as { id: unknown }).id)
      : "";
  if (change === "deleted" && id) {
    dispatch({ type: "REMOVE", entity, id });
    return;
  }
  void refetchAfter(entity);
};
```

`REMOVE` (`DataProvider.tsx:126-148`) is a pure filter by `id` per entity
kind. Deletes are intentionally not a structural refetch — a removed row is
cheap to splice locally and a network call would just confirm what the event
already told us.

## 2. Why not in-place merge?

A view author looking at the wire might be tempted to merge the event payload
into the cached entity. Resist this — **the payload is only the entity id**.

Daemon emit sites (`daemon/src/routes/tasks.rs:369,406,434,579,889,1143` and
the equivalents in `routes/plans.rs`, `routes/cycles.rs`, `routes/units.rs`,
`routes/knowledge.rs`, `routes/comments.rs`):

```rust
app.emit("task:created", serde_json::json!({ "id": with_env.task.id }));
app.emit("task:updated", serde_json::json!({ "id": canonical }));
app.emit("task:deleted", serde_json::json!({ "id": canonical }));
```

A cascade emit may carry one extra field:

```rust
app.emit(event_name, serde_json::json!({ "id": entity_id, "cascade": true }));
```

No entity body, no diff, no version. A client that wants the new state must
ask for it. The structural-refetch pattern is therefore the only correct path
for non-delete events; an in-place merger would have nothing to merge.

### When in-place merge would be appropriate

If a future daemon release adds full-entity payloads (a backwards-compatible
addition under `response-shape-backwards-compat.md`), the renderer could merge
the payload into the cached row without a network call. That change is
**not** in scope — the SSE wire contract today carries only `{id}` and the
desktop should stay in the structural-refetch pattern until the daemon
contract evolves. Do not pre-emptively code a merge path.

## 3. Reconnect semantics

EventSource handles reconnect on its own; the desktop renderer delegates the
retry loop entirely. The relevant snippet (`apps/desktop/src/data/hooks/useEvents.ts:159-201`):

```ts
const Impl: typeof EventSource =
  opts.eventSourceImpl ??
  (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource!;
// ...
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
```

Three things to know:

1. **`Last-Event-ID` is automatic.** The browser/Node `EventSource`
   implementation sends the most recently seen `id:` as `Last-Event-ID` on the
   reconnect HTTP request — the hook does not need to track or replay it
   manually. The hook still exposes `lastEventId` on `UseEventsState` so a
   caller can pair SSE with a manual replay if needed.
2. **No backoff in the hook.** The platform `EventSource` retry timer is
   what runs the loop. The hook does not jitter or cap retries; it only
   reports `readyState` transitions back to the provider.
3. **The daemon emits new events only.** From
   `apps/desktop/src/data/hooks/useEvents.ts:140-148`: "Today the daemon
   emits new events only — replay goes through the separate `/events/replay`
   endpoint — so callers should re-fetch their entity lists on
   `readyState === \"open\"` to catch up on anything they missed during the
   outage." The desktop renderer does not currently call `/events/replay`;
   the next event after reconnect triggers a fresh structural refetch, which
   masks the gap in practice. If a view needs gap-free state, call
   `refresh()` from `useData()` on its own reconnect-aware effect.

## 4. Auth and the 401 path

The daemon's TCP listener requires either an `X-Clawket-Token` header or the
`clawket_session` HttpOnly cookie. The `DaemonClient` (`apps/desktop/src/data/api.ts`)
caches the token in memory and reloads it from `~/.cache/clawket/clawketd.token`
on first use.

```ts
// api.ts:90-100
invalidateToken(): void {
  this.cachedToken = null;
}

private async token(): Promise<string> {
  if (this.cachedToken !== null) return this.cachedToken;
  const t = await this.tokenLoader();
  this.cachedToken = t;
  return t;
}
```

```ts
// api.ts:102-129 (excerpt)
if (token) headers.set("X-Clawket-Token", token);
// ...
if (resp.status === 401) this.invalidateToken();
```

On a 401 the cached token is dropped but the failing request itself is **not**
auto-retried; the error bubbles to the caller (today: `INIT_ERROR` in
`DataProvider`). The next request re-resolves the token from the cache file
and succeeds if the daemon rotated it. A caller that wants transparent retry
must wrap its own call — do not add a retry loop inside the client until a
real use case demands it.

For SSE, `EventSource` carries the `clawket_session` cookie via
`withCredentials: true` (`useEvents.ts:187`). A 401 on the SSE handshake
surfaces as `error` in `UseEventsState` and the platform retry loop continues;
the cookie is refreshed on the next authenticated HTTP request.

## 5. Author guidance for a new view

1. Use `useData()` to read entities. Do not open your own `EventSource`.
2. Do not add an `UPSERT_*` reducer arm for a new entity — extend the daemon
   contract first, then `parseEventName`, then `refetchAfter`. The reducer is
   the bottom of the stack; widening it first creates dead code.
3. If your view needs derived state that is expensive to compute, memoize off
   the cached arrays. The arrays are replaced (not mutated) on every refetch,
   so referential equality is reliable.
4. Don't write a "delete locally then refetch to confirm" path. The local
   remove is final — the next created/updated event covers any drift.
5. If your view needs gap-free state across a reconnect, call `refresh()`
   from `useData()` when `sse.readyState` transitions back to `"open"`.
   Today no view does this; it is a hook reserved for views that materialize
   long-running computations from the event stream.
