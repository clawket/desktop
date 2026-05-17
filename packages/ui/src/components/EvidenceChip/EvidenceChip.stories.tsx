import type { Meta, StoryObj } from "@storybook/react";
import { EvidenceChip } from "./EvidenceChip";

const meta = {
  title: "Domain/EvidenceChip",
  component: EvidenceChip,
  parameters: { layout: "centered" },
  argTypes: {
    hasEvidence: { control: "boolean" },
    size: { control: "radio", options: ["sm", "md"] },
  },
  args: { hasEvidence: true, size: "sm" },
} satisfies Meta<typeof EvidenceChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Present: Story = { args: { hasEvidence: true } };
export const Missing: Story = { args: { hasEvidence: false } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <EvidenceChip hasEvidence size="sm" />
      <EvidenceChip hasEvidence size="md" />
      <EvidenceChip hasEvidence={false} size="sm" />
      <EvidenceChip hasEvidence={false} size="md" />
    </div>
  ),
};

export const CustomLabel: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <EvidenceChip hasEvidence label="evidence: 1.2 KiB" size="md" />
      <EvidenceChip hasEvidence={false} label="evidence required" size="md" />
    </div>
  ),
};

export const InTaskRow: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-[28rem]">
      <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
        <span className="text-body-base text-foreground">LM-10876 Badge</span>
        <EvidenceChip hasEvidence />
      </div>
      <div className="flex items-center justify-between rounded-md bg-surface px-3 py-2">
        <span className="text-body-base text-foreground">LM-10877 Domain</span>
        <EvidenceChip hasEvidence={false} />
      </div>
    </div>
  ),
};
