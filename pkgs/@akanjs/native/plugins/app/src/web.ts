import { AkanNativeError, app as appInfo, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { AppApi, AppEvents } from "./index.ts";

// A web page cannot quit or minimize its tab (capacitor-plugins/app/src/web.ts rejects the same); starting it
// over is a reload.
export const web = defineWebPlugin<AppApi, AppEvents>({
  methods: {
    async relaunch() {
      location.reload();
    },
    async getInfo() {
      if (!appInfo) throw new AkanNativeError("UNSUPPORTED", "no app info (the page was not built by akan-native)");
      return { id: appInfo.id, name: appInfo.name, version: appInfo.version, build: appInfo.build ?? 1 };
    },
    getLaunchUrl: async () => ({ url: null }),
  },
});
