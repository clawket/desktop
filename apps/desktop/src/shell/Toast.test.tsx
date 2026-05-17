import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ToastContainer from "./Toast";
import { toast, toastError, toastSuccess } from "../lib/toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
});

describe("ToastContainer (Phase D — LM-10986)", () => {
  it("renders nothing when no toast has fired", () => {
    render(<ToastContainer />);
    expect(screen.queryByTestId("toast-container")).toBeNull();
  });

  it("renders an info toast and auto-dismisses after 4s", () => {
    render(<ToastContainer />);
    act(() => {
      toast("Saved");
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("keeps error toasts sticky (duration=0)", () => {
    render(<ToastContainer />);
    act(() => {
      toastError("Something broke");
    });
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("collapses duplicate toasts into a single row with a count badge", () => {
    render(<ToastContainer />);
    act(() => {
      toastSuccess("Done");
      toastSuccess("Done");
      toastSuccess("Done");
    });
    const rows = screen.getAllByRole("alert");
    expect(rows).toHaveLength(1);
    expect(screen.getByLabelText("Repeated 3 times")).toHaveTextContent("×3");
  });

  it("dismisses a toast when the close button is clicked", () => {
    render(<ToastContainer />);
    act(() => {
      toast("Closable");
    });
    expect(screen.getByText("Closable")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("Closable")).toBeNull();
  });
});
