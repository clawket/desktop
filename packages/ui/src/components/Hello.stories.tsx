import type { Meta, StoryObj } from "@storybook/react";
import { Hello } from "./Hello";

const meta = {
  title: "Smoke/Hello",
  component: Hello,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Hello>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Clawket",
  },
};

export const CustomName: Story = {
  args: {
    name: "Workbench",
  },
};
