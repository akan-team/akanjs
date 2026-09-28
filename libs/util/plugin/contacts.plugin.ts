import type { AkanPlugin } from "akanjs";

export const contactsPlugin: AkanPlugin = {
  name: "contacts",
  native: {
    permission: "contacts",
    plugins: ["contacts"],
    usageDescriptions: {
      contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to find people you know.",
    },
  },
};
