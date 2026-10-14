import type { Preview } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en-US.json";
import zhMessages from "../messages/zh-CN.json";
import "../src/app/globals.css";
import "../src/app/styles/workspace.css";

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <NextIntlClientProvider
        locale={context.globals.locale === "en-US" ? "en-US" : "zh-CN"}
        messages={context.globals.locale === "en-US" ? enMessages : zhMessages}
      >
        <Story />
      </NextIntlClientProvider>
    ),
  ],
  globalTypes: {
    locale: {
      defaultValue: "zh-CN",
      toolbar: {
        icon: "globe",
        items: ["zh-CN", "en-US"],
      },
    },
  },
  parameters: {
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};

export default preview;
