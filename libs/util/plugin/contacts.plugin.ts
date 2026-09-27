import type { AkanPlugin } from "akanjs";

export const contactsPlugin: AkanPlugin = {
  name: "contacts",
  native: {
    permission: "contacts",
    usageDescriptions: {
      contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to add new contacts.",
    },
    androidPermissions: ["READ_CONTACTS", "WRITE_CONTACTS"],
  },
};
