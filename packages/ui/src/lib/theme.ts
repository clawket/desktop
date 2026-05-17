import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

const KEY = "clawket.theme";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(KEY) as Theme | null;
  if (stored === "dark" || stored === "light" || stored === "system") return stored;
  return "system";
}

export function setTheme(theme: Theme): void {
  window.localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function initTheme(): () => void {
  const theme = getStoredTheme();
  applyTheme(theme);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    if (getStoredTheme() === "system") applyTheme("system");
  };
  mq.addEventListener("change", handleChange);
  return () => mq.removeEventListener("change", handleChange);
}

export function getCurrentEffectiveTheme(): "dark" | "light" {
  const stored = getStoredTheme();
  if (stored !== "system") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export interface UseThemeResult {
  /** Stored preference: 'dark' | 'light' | 'system'. */
  stored: Theme;
  /** Currently rendered theme (system resolved). */
  effective: "dark" | "light";
  /** Cycle stored: light → dark → system → light. */
  cycle: () => void;
  /** Set explicit value (breaks out of system if not 'system'). */
  set: (theme: Theme) => void;
}

export function useTheme(): UseThemeResult {
  const [stored, setStored] = useState<Theme>(getStoredTheme);
  const [effective, setEffective] = useState<"dark" | "light">(getCurrentEffectiveTheme);

  useEffect(() => {
    const update = () => {
      setStored(getStoredTheme());
      setEffective(getCurrentEffectiveTheme());
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const set = useCallback((theme: Theme) => {
    setTheme(theme);
    setStored(theme);
    setEffective(getCurrentEffectiveTheme());
  }, []);

  const cycle = useCallback(() => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(stored) + 1) % order.length];
    set(next);
  }, [stored, set]);

  return { stored, effective, cycle, set };
}
