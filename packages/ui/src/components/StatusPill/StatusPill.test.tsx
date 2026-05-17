import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("renders the status label by default", () => {
    render(<StatusPill status="in_progress" />);
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("exposes the status via data-status for E2E targeting", () => {
    render(<StatusPill status="done" />);
    const root = screen.getByText("done").parentElement;
    expect(root).toHaveAttribute("data-status", "done");
  });

  it("maps done to success color", () => {
    render(<StatusPill status="done" />);
    const root = screen.getByText("done").parentElement;
    expect(root?.className).toContain("text-success");
  });

  it("maps blocked to warning color", () => {
    render(<StatusPill status="blocked" />);
    const root = screen.getByText("blocked").parentElement;
    expect(root?.className).toContain("text-warning");
  });

  it("applies strikethrough on cancelled", () => {
    render(<StatusPill status="cancelled" />);
    const root = screen.getByText("cancelled").parentElement;
    expect(root?.className).toMatch(/line-through/);
  });

  it("renders the dot indicator by default", () => {
    const { container } = render(<StatusPill status="in_progress" />);
    expect(container.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });

  it("omits the dot when hideDot is true", () => {
    const { container } = render(<StatusPill status="in_progress" hideDot />);
    expect(container.querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("accepts a custom label override", () => {
    render(<StatusPill status="in_progress" label="진행 중" />);
    expect(screen.getByText("진행 중")).toBeInTheDocument();
  });
});
