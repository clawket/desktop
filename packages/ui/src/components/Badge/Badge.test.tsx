import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Beta</Badge>);
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("applies success variant classes", () => {
    render(<Badge variant="success">OK</Badge>);
    const root = screen.getByText("OK").parentElement;
    expect(root?.className).toContain("text-success");
  });

  it("applies danger variant classes", () => {
    render(<Badge variant="danger">Bad</Badge>);
    const root = screen.getByText("Bad").parentElement;
    expect(root?.className).toContain("text-danger");
  });

  it("applies md size class h-6 and sm size class h-5", () => {
    const { rerender } = render(<Badge size="sm">x</Badge>);
    let root = screen.getByText("x").parentElement;
    expect(root?.className).toMatch(/\bh-5\b/);
    rerender(<Badge size="md">x</Badge>);
    root = screen.getByText("x").parentElement;
    expect(root?.className).toMatch(/\bh-6\b/);
  });

  it("renders a dot indicator when dot=true", () => {
    const { container } = render(
      <Badge dot variant="info">
        run
      </Badge>,
    );
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot?.className).toMatch(/rounded-full/);
    expect(dot?.className).toContain("bg-primary");
  });

  it("omits the dot indicator by default", () => {
    const { container } = render(<Badge variant="info">run</Badge>);
    expect(container.querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("merges custom className via cn() without dropping base classes", () => {
    render(<Badge className="custom-x">x</Badge>);
    const root = screen.getByText("x").parentElement;
    expect(root).toHaveClass("custom-x");
    expect(root?.className).toMatch(/inline-flex/);
  });

  it("forwards ref to the underlying span", () => {
    const ref = { current: null as HTMLSpanElement | null };
    render(<Badge ref={ref}>x</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
