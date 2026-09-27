import { AkanNativeError, defineWebPlugin, type WebCallContext } from "../../../packages/core/src/index.ts";
import type { OpenerApi } from "./index.ts";
import { checkUrl, checkUrlScope } from "./url.ts";

// Web: http(s) in a new tab, mailto:/tel: handed to the OS by navigating (the page stays loaded).
// openUrl stays synchronous so window.open runs inside the click's user activation.
// openSettings has no web equivalent and is UNSUPPORTED.

export const web = defineWebPlugin<OpenerApi>({
  methods: {
    openUrl(args, ctx?: WebCallContext) {
      const url = checkUrl(args?.url);
      checkUrlScope(ctx?.scope, url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        // Not "noopener": with it window.open returns null, and a blocked popup could not be told apart.
        const opened = window.open(url.href, "_blank");
        if (!opened)
          throw new AkanNativeError(
            "PERMISSION_DENIED",
            "the browser blocked the new window (call openUrl from a click)",
          );
        try {
          opened.opener = null; // what noopener does; still allowed while the new window is on about:blank
        } catch {
          // cross-origin already: nothing to clear
        }
      } else {
        window.location.href = url.href;
      }
      return Promise.resolve();
    },
    // Browsers expose no handler lookup; capacitor-plugins/app-launcher/src/web.ts answers true as well.
    canOpenUrl: async (args) => {
      checkUrl(args?.url);
      return { value: true };
    },
  },
});
