import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierMark } from "./TierMark";

describe("TierMark", () => {
  it("renders tier:label by default", () => {
    render(<TierMark tier="high" />);
    expect(screen.getByText("tier:high")).toBeInTheDocument();
  });

  it("renders bare label when showPrefix=false", () => {
    render(<TierMark tier="high" showPrefix={false} />);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("maps high to danger color", () => {
    render(<TierMark tier="high" />);
    const root = screen.getByText("tier:high").parentElement;
    expect(root?.className).toContain("text-danger");
  });

  it("maps med to accent color", () => {
    render(<TierMark tier="med" />);
    const root = screen.getByText("tier:med").parentElement;
    expect(root?.className).toContain("text-accent");
  });

  it("maps low to neutral foreground", () => {
    render(<TierMark tier="low" />);
    const root = screen.getByText("tier:low").parentElement;
    expect(root?.className).toContain("text-foreground");
  });

  it("exposes the tier via data-tier", () => {
    render(<TierMark tier="med" />);
    const root = screen.getByText("tier:med").parentElement;
    expect(root).toHaveAttribute("data-tier", "med");
  });
});
