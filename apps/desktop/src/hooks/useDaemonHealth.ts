import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "../data/DataProvider";

export interface UseDaemonHealthOptions {
  /** Polling interval (default 10s, parity with web). */
  intervalMs?: number;
  /** Fires whenever connectivity flips (true → false or false → true). */
  onStatusChange?: (connected: boolean) => void;
}

/**
 * Polls daemon `/health` via `useData().health` to surface liveness in the
 * Topbar daemon-health pill. Exposes `reconnect()` so the pill click handler
 * (and other recovery affordances) can force an immediate re-poll.
 *
 * Ports `clawket/web/src/hooks/useDaemonHealth.ts` — same cadence and flip-
 * detection semantics so behavior is identical across web and desktop.
 */
export function useDaemonHealth(opts: UseDaemonHealthOptions = {}): {
  connected: boolean;
  reconnect: () => void;
} {
  const { intervalMs = 10_000, onStatusChange } = opts;
  const { health } = useData();
  const [connected, setConnected] = useState(false);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });
  const prevConnectedRef = useRef(false);
  const healthRef = useRef(health);
  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  const poll = useCallback(async () => {
    const next = await healthRef.current();
    setConnected(next);
    if (prevConnectedRef.current !== next) {
      onStatusChangeRef.current?.(next);
      prevConnectedRef.current = next;
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      void poll();
    }, 0);
    const handle = setInterval(() => {
      void poll();
    }, intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(handle);
    };
  }, [poll, intervalMs]);

  const reconnect = useCallback(() => {
    void poll();
  }, [poll]);

  return { connected, reconnect };
}
