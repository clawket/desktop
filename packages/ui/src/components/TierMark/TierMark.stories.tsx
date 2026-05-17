import type { Meta, StoryObj } from "@storybook/react";
import { TierMark, type Tier } from "./TierMark";

const meta = {
  title: "Domain/TierMark",
  component: TierMark,
  parameters: { layout: "centered" },
  argTypes: {
    tier: { control: "radio", options: ["low", "med", "high"] },
    size: { control: "radio", options: ["sm", "md"] },
    showPrefix: { control: "boolean" },
  },
  args: { tier: "med", size: "sm", showPrefix: true },
} satisfies Meta<typeof TierMark>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL: Tier[] = ["low", "med", "high"];

export const Default: Story = {};

export const AllTiers: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {ALL.map((t) => (
        <TierMark key={t} tier={t} />
      ))}
    </div>
  ),
};

export const WithoutPrefix: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {ALL.map((t) => (
        <TierMark key={t} tier={t} showPrefix={false} />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <TierMark tier="high" size="sm" />
      <TierMark tier="high" size="md" />
    </div>
  ),
};
