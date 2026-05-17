import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentTag, resolveAgentVariant } from "./AgentTag";

describe("AgentTag", () => {
  it("renders the agent name", () => {
    render(<AgentTag agent="main" />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("exposes the agent via data-agent for filtering", () => {
    render(<AgentTag agent="sub-agent-3" />);
    expect(screen.getByText("sub-agent-3").closest("[data-agent]")).toHaveAttribute(
      "data-agent",
      "sub-agent-3",
    );
  });

  it("maps 'main' to the neutral palette", () => {
    expect(resolveAgentVariant("main")).toBe("neutral");
  });

  it("hashes sub-agent names into the 4-colour palette", () => {
    const palette = new Set(["info", "accent", "success", "warning"]);
    for (const name of ["sub-agent-1", "sub-agent-2", "reviewer", "planner", "x"]) {
      expect(palette.has(resolveAgentVariant(name))).toBe(true);
    }
  });

  it("returns the same colour for the same agent (deterministic)", () => {
    expect(resolveAgentVariant("reviewer")).toBe(resolveAgentVariant("reviewer"));
    expect(resolveAgentVariant("sub-agent-7")).toBe(
      resolveAgentVariant("sub-agent-7"),
    );
  });

  it("renders the dot indicator by default", () => {
    const { container } = render(<AgentTag agent="main" />);
    expect(container.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });

  it("omits the dot when hideDot is true", () => {
    const { container } = render(<AgentTag agent="main" hideDot />);
    expect(container.querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("accepts an explicit variant override", () => {
    render(<AgentTag agent="main" variant="danger" />);
    const root = screen.getByText("main").closest("[data-agent]");
    expect(root?.className).toContain("text-danger");
  });
});
