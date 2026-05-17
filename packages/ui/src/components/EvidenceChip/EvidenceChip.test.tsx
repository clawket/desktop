import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceChip } from "./EvidenceChip";

describe("EvidenceChip", () => {
  it("renders 'evidence' when hasEvidence=true", () => {
    render(<EvidenceChip hasEvidence />);
    expect(screen.getByText("evidence")).toBeInTheDocument();
  });

  it("renders 'no evidence' when hasEvidence=false", () => {
    render(<EvidenceChip hasEvidence={false} />);
    expect(screen.getByText("no evidence")).toBeInTheDocument();
  });

  it("maps hasEvidence=true to success color", () => {
    render(<EvidenceChip hasEvidence />);
    const root = screen.getByText("evidence").closest("[data-evidence]");
    expect(root?.className).toContain("text-success");
    expect(root).toHaveAttribute("data-evidence", "present");
  });

  it("maps hasEvidence=false to danger color", () => {
    render(<EvidenceChip hasEvidence={false} />);
    const root = screen.getByText("no evidence").closest("[data-evidence]");
    expect(root?.className).toContain("text-danger");
    expect(root).toHaveAttribute("data-evidence", "missing");
  });

  it("explains the 4 KiB cap via the default tooltip", () => {
    render(<EvidenceChip hasEvidence={false} />);
    const root = screen.getByText("no evidence").closest("[data-evidence]");
    expect(root?.getAttribute("title")).toMatch(/4 KiB/);
  });

  it("allows label overrides", () => {
    render(<EvidenceChip hasEvidence label="evidence: 1.2 KiB" />);
    expect(screen.getByText("evidence: 1.2 KiB")).toBeInTheDocument();
  });

  it("allows title overrides", () => {
    render(<EvidenceChip hasEvidence title="custom tooltip" />);
    const root = screen.getByText("evidence").closest("[data-evidence]");
    expect(root).toHaveAttribute("title", "custom tooltip");
  });
});
