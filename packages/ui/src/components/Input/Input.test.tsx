import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";
import { Label } from "./Label";
import { HelperText } from "./HelperText";
import { FormField } from "./FormField";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Name" />);
    expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();
  });

  it("fires onChange while typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input onChange={onChange} placeholder="x" />);
    await user.type(screen.getByPlaceholderText("x"), "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("sets aria-invalid when invalid prop is true", () => {
    render(<Input invalid placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("does not set aria-invalid by default", () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("respects disabled and blocks typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input disabled onChange={onChange} placeholder="x" />);
    await user.type(screen.getByPlaceholderText("x"), "abc");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("x")).toBeDisabled();
  });

  it("forwards ref to the underlying input", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} placeholder="x" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("renders leading and trailing icons", () => {
    render(
      <Input
        placeholder="x"
        leadingIcon={<span data-testid="lead">L</span>}
        trailingIcon={<span data-testid="trail">T</span>}
      />,
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });
});

describe("Label", () => {
  it("associates via htmlFor and shows required marker", () => {
    render(
      <>
        <Label htmlFor="city" required>
          City
        </Label>
        <Input id="city" />
      </>,
    );
    const label = screen.getByText("City");
    expect(label.closest("label")).toHaveAttribute("for", "city");
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });
});

describe("HelperText", () => {
  it("renders alert role when variant=error", () => {
    render(
      <HelperText id="h1" variant="error">
        Bad value
      </HelperText>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Bad value");
  });

  it("does not use alert role when variant=default", () => {
    render(<HelperText id="h2">Hint</HelperText>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Hint")).toBeInTheDocument();
  });
});

describe("FormField", () => {
  it("wires label htmlFor → input id automatically", () => {
    render(
      <FormField label="Email">
        <Input placeholder="you@clawket.app" />
      </FormField>,
    );
    const input = screen.getByPlaceholderText("you@clawket.app");
    const label = screen.getByText("Email").closest("label");
    expect(label).toHaveAttribute("for", input.id);
    expect(input.id).toBeTruthy();
  });

  it("links helperText via aria-describedby", () => {
    render(
      <FormField label="Email" helperText="We never share this.">
        <Input placeholder="you@clawket.app" />
      </FormField>,
    );
    const input = screen.getByPlaceholderText("you@clawket.app");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helper = document.getElementById(describedBy!);
    expect(helper).toHaveTextContent("We never share this.");
  });

  it("prefers error over helperText and sets aria-invalid", () => {
    render(
      <FormField
        label="Email"
        helperText="hidden when error is set"
        error="Required field."
      >
        <Input placeholder="x" />
      </FormField>,
    );
    const input = screen.getByPlaceholderText("x");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required field.");
    expect(screen.queryByText("hidden when error is set")).toBeNull();
  });

  it("forwards disabled to the child input", () => {
    render(
      <FormField label="Locked" disabled>
        <Input placeholder="x" />
      </FormField>,
    );
    expect(screen.getByPlaceholderText("x")).toBeDisabled();
  });

  it("marks the label as required when required is set", () => {
    render(
      <FormField label="Name" required>
        <Input placeholder="x" />
      </FormField>,
    );
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });
});
