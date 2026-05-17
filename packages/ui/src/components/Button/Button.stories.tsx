import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "primary", "ghost", "outline", "danger"],
    },
    size: { control: "radio", options: ["sm", "md", "lg"] },
    fullWidth: { control: "boolean" },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Continue",
    variant: "default",
    size: "md",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = { args: { variant: "primary", children: "Create task" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Cancel" } };
export const Outline: Story = { args: { variant: "outline", children: "Open dialog" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete cycle" } };

export const SizesMatrix: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const VariantsMatrix: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3">
      <Button variant="default">Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};

export const Loading: Story = { args: { loading: true, children: "Saving…" } };
export const FullWidth: Story = {
  args: { fullWidth: true, variant: "primary" },
  decorators: [(Story) => <div className="w-80"><Story /></div>],
};
export const Disabled: Story = { args: { disabled: true } };
