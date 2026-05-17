// Time / duration formatting helpers shared between the Timeline swimlane and
// activity-stream sub-views.
//
// Desktop wire fact: the daemon serializes timestamps as ISO 8601 strings
// (e.g. `2026-05-14T12:00:00.000Z`) on the HTTP surface, but the Run /
// TimelineEvent shapes here also tolerate numeric epoch ms because the SSE
// event_id / future fields might switch encoding without warning. `toMs`
// normalises both forms.
//
// Why colocate here (and not promote to `@clawket/ui/lib`): web's
// TimelineView has its own copies of these helpers because web's wire shape
// is subtly different (web's TimelineEvent.created_at is `number`, not
// ISO). Promoting now would force a contract that doesn't yet exist on
// either side of the wire; we keep helpers per-app until the wire stabilises.

export function toMs(ts: number | string | null | undefined): number {
  if (ts == null) return NaN;
  if (typeof ts === "number") return ts;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? NaN : parsed;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function formatTime(ts: number | string | null | undefined): string {
  const ms = toMs(ts);
  if (!Number.isFinite(ms)) return "--:--";
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function formatDate(
  ts: number | string | null | undefined,
  now: Date = new Date(),
): string {
  const ms = toMs(ts);
  if (!Number.isFinite(ms)) return "--";
  const d = new Date(ms);
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
