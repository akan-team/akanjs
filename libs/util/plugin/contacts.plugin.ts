import type { AkanNativeContext, AkanPlugin } from "akanjs";

const configureContactsNative = async (ctx: AkanNativeContext) => {
  await ctx.setIosUsageDescriptions({
    contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to add new contacts.",
  });
  ctx.addAndroidPermissions(["READ_CONTACTS", "WRITE_CONTACTS"]);
};

export const contactsPlugin: AkanPlugin = {
  name: "contacts",
  runtimePackages: (ctx) => (ctx.hasMobilePermission("contacts") ? ["@capacitor-community/contacts"] : []),
  capacitor: {
    permission: "contacts",
    configureNative: configureContactsNative,
  },
};
