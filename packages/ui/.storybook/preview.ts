import type { Preview } from "@storybook/react";
import "../src/styles/base.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "workbench-dark",
      values: [
        { name: "workbench-dark", value: "#0a0a0a" },
        { name: "workbench-light", value: "#ffffff" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
