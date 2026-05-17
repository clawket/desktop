import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Input } from "./Input";
import { FormField } from "./FormField";

const meta = {
  title: "Primitives/Input",
  component: Input,
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "radio", options: ["default", "error"] },
    inputSize: { control: "radio", options: ["md", "lg"] },
    invalid: { control: "boolean" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
  },
  args: {
    placeholder: "Type something…",
    inputSize: "md",
    variant: "default",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Error: Story = {
  args: { invalid: true, defaultValue: "broken-value", placeholder: "Invalid" },
};

export const Sized: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Input inputSize="md" placeholder="Medium" />
      <Input inputSize="lg" placeholder="Large" />
    </div>
  ),
};

const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const ClearIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Input leadingIcon={<SearchIcon />} placeholder="Search tasks…" />
      <Input
        leadingIcon={<SearchIcon />}
        trailingIcon={<ClearIcon />}
        defaultValue="LM-10875"
      />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, defaultValue: "Locked" } };

export const ReadOnly: Story = {
  args: { readOnly: true, defaultValue: "LM-10875 (read only)" },
};

export const InFormField: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <FormField label="Cycle name" helperText="Used in dashboard headers.">
        <Input placeholder="Sprint 4: Tokens + Primitives" />
      </FormField>
      <FormField
        label="Task ID"
        required
        error="That task ID is already taken."
      >
        <Input defaultValue="LM-10875" />
      </FormField>
    </div>
  ),
};

export const Controlled: Story = {
  render: function ControlledStory() {
    const [value, setValue] = useState("");
    return (
      <FormField
        label="Evidence URL"
        helperText={value.length === 0 ? "Required for done transition." : `${value.length} chars`}
        error={value.length > 0 && !value.startsWith("http") ? "Must start with http(s)://" : undefined}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://github.com/..."
        />
      </FormField>
    );
  },
};
