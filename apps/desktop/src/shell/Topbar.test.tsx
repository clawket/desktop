import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Topbar } from "./Topbar";

describe("Topbar daemon-health pill", () => {
  it("renders an enabled reconnect button when daemon is unhealthy", () => {
    const onReconnect = vi.fn();
    render(
      <Topbar
        activeView="summary"
        onViewChange={() => {}}
        onOpenPalette={() => {}}
        daemonHealthy={false}
        onReconnect={onReconnect}
      />,
    );
    const pill = screen.getByTestId("daemon-health");
    expect(pill.tagName).toBe("BUTTON");
    expect(pill).toHaveAttribute("data-healthy", "false");
    expect(pill).not.toBeDisabled();
    expect(pill).toHaveTextContent("daemon down");
    expect(pill).toHaveAttribute(
      "title",
      "Daemon down — click to reconnect",
    );
  });

  it("fires onReconnect when the unhealthy pill is clicked", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    render(
      <Topbar
        activeView="summary"
        onViewChange={() => {}}
        onOpenPalette={() => {}}
        daemonHealthy={false}
        onReconnect={onReconnect}
      />,
    );
    await user.click(screen.getByTestId("daemon-health"));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("disables the pill and does not fire onReconnect when healthy", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    render(
      <Topbar
        activeView="summary"
        onViewChange={() => {}}
        onOpenPalette={() => {}}
        daemonHealthy={true}
        onReconnect={onReconnect}
      />,
    );
    const pill = screen.getByTestId("daemon-health");
    expect(pill).toBeDisabled();
    expect(pill).toHaveTextContent("daemon ok");
    expect(pill).toHaveAttribute("title", "Daemon connected");
    await user.click(pill);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("defaults to healthy when daemonHealthy is omitted", () => {
    render(
      <Topbar
        activeView="summary"
        onViewChange={() => {}}
        onOpenPalette={() => {}}
      />,
    );
    expect(screen.getByTestId("daemon-health")).toHaveAttribute(
      "data-healthy",
      "true",
    );
  });
});
