import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

function Harness({
  onPalette,
  onHelp,
}: {
  onPalette?: () => void;
  onHelp?: () => void;
}) {
  useGlobalShortcuts({ onPalette, onHelp });
  return (
    <div>
      <input data-testid="text-input" />
      <textarea data-testid="textarea" />
    </div>
  );
}

describe("useGlobalShortcuts (Phase D — LM-10987)", () => {
  it("fires onPalette on Cmd+K", () => {
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  it("fires onPalette on Ctrl+K", () => {
    const onPalette = vi.fn();
    render(<Harness onPalette={onPalette} />);
    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  it("fires onHelp on '?'", () => {
    const onHelp = vi.fn();
    render(<Harness onHelp={onHelp} />);
    fireEvent.keyDown(window, { key: "?" });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("suppresses '?' when typing in an input", () => {
    const onHelp = vi.fn();
    const { getByTestId } = render(<Harness onHelp={onHelp} />);
    fireEvent.keyDown(getByTestId("text-input"), { key: "?" });
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("suppresses '?' when typing in a textarea", () => {
    const onHelp = vi.fn();
    const { getByTestId } = render(<Harness onHelp={onHelp} />);
    fireEvent.keyDown(getByTestId("textarea"), { key: "?" });
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("does not fire onPalette when handler is omitted", () => {
    const onHelp = vi.fn();
    render(<Harness onHelp={onHelp} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onHelp).not.toHaveBeenCalled();
  });
});
