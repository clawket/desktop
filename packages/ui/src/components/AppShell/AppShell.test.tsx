import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders all slots as semantic landmarks", () => {
    render(
      <AppShell.Root>
        <AppShell.Sidebar>side</AppShell.Sidebar>
        <AppShell.Content>
          <AppShell.Topbar>top</AppShell.Topbar>
          <AppShell.Main>main</AppShell.Main>
        </AppShell.Content>
      </AppShell.Root>,
    );
    expect(screen.getByRole("complementary")).toHaveTextContent("side");
    expect(screen.getByRole("banner")).toHaveTextContent("top");
    expect(screen.getByRole("main")).toHaveTextContent("main");
  });

  it("tags each slot with a data-slot attribute for E2E targeting", () => {
    const { container } = render(
      <AppShell.Root>
        <AppShell.Sidebar />
        <AppShell.Content>
          <AppShell.Topbar />
          <AppShell.Main />
        </AppShell.Content>
      </AppShell.Root>,
    );
    expect(
      container.querySelector('[data-slot="app-shell-root"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="app-shell-sidebar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="app-shell-content"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="app-shell-topbar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="app-shell-main"]'),
    ).not.toBeNull();
  });

  it("forwards ref to the root element", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <AppShell.Root ref={ref}>
        <AppShell.Sidebar />
        <AppShell.Content>
          <AppShell.Topbar />
          <AppShell.Main />
        </AppShell.Content>
      </AppShell.Root>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("merges custom className via cn() without losing base layout", () => {
    const { container } = render(
      <AppShell.Root className="custom-shell">
        <AppShell.Sidebar />
        <AppShell.Content>
          <AppShell.Topbar />
          <AppShell.Main />
        </AppShell.Content>
      </AppShell.Root>,
    );
    const root = container.querySelector('[data-slot="app-shell-root"]');
    expect(root).toHaveClass("custom-shell");
    expect(root?.className).toMatch(/h-screen/);
  });
});
