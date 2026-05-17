import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("renders an inline SVG with default 24px size", () => {
    render(<BrandMark />);
    const svg = screen.getByTestId("brand-mark");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("honours a custom size", () => {
    render(<BrandMark size={48} />);
    const svg = screen.getByTestId("brand-mark");
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });

  it("forwards className for layout overrides", () => {
    render(<BrandMark className="shrink-0" />);
    expect(screen.getByTestId("brand-mark")).toHaveClass("shrink-0");
  });
});
