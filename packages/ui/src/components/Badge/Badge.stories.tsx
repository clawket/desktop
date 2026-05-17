import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["neutral", "success", "warning", "danger", "info", "accent"],
    },
    size: { control: "radio", options: ["sm", "md"] },
    dot: { control: "boolean" },
  },
  args: {
    children: "Badge",
    variant: "neutral",
    size: "sm",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Neutral: Story = { args: { children: "Default" } };
export const Success: Story = { args: { variant: "success", children: "Passing" } };
export const Warning: Story = { args: { variant: "warning", children: "Blocked" } };
export const Danger: Story = { args: { variant: "danger", children: "Failing" } };
export const Info: Story = { args: { variant: "info", children: "Info" } };
export const Accent: Story = { args: { variant: "accent", children: "Beta" } };

export const VariantsMatrix: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3">
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="accent">Accent</Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge size="sm" variant="info">SM</Badge>
      <Badge size="md" variant="info">MD</Badge>
    </div>
  ),
};

export const WithDot: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3">
      <Badge dot variant="neutral">todo</Badge>
      <Badge dot variant="info">in_progress</Badge>
      <Badge dot variant="warning">blocked</Badge>
      <Badge dot variant="success">done</Badge>
      <Badge dot variant="danger">failed</Badge>
      <Badge dot variant="accent">running</Badge>
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-3">
      <span className="text-body-base text-foreground">LM-10876</span>
      <Badge dot variant="info" size="sm">in_progress</Badge>
      <Badge variant="accent" size="sm">tier:med</Badge>
    </div>
  ),
};
