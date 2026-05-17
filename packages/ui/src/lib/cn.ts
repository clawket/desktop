import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Custom typography scale exposed by `@theme inline` in styles/base.css.
 *
 * Without this, `tailwind-merge` mistakes `text-body-base` (size) for a member
 * of the text-color group and silently drops sibling tokens like `text-danger`
 * / `text-foreground`. Register them explicitly so the size and color groups
 * stay independent.
 */
const TYPOGRAPHY_SIZES = [
  "display-2xl",
  "display-xl",
  "headline-lg",
  "headline-md",
  "body-lg",
  "body-base",
  "body-sm",
  "label-sm",
] as const;

const twMergeCustom = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPOGRAPHY_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMergeCustom(clsx(inputs));
}
