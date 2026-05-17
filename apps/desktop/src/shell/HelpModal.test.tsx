import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HelpModal from "./HelpModal";

describe("HelpModal (Phase D — LM-10987)", () => {
  it("renders nothing when closed", () => {
    render(<HelpModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("help-modal")).toBeNull();
  });

  it("renders all three documented shortcuts when open", () => {
    render(<HelpModal open={true} onClose={() => {}} />);
    expect(screen.getByText("Show this help")).toBeInTheDocument();
    expect(screen.getByText("Open command palette")).toBeInTheDocument();
    expect(screen.getByText("Close modal / drawer")).toBeInTheDocument();
    expect(screen.getByText("Cmd")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<HelpModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("help-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the dialog body", () => {
    const onClose = vi.fn();
    render(<HelpModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Keyboard shortcuts"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<HelpModal open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    render(<HelpModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
