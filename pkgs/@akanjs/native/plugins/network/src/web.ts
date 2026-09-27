import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { ConnectionType, NetworkApi, NetworkEvents, NetworkStatus } from "./index.ts";

// navigator.onLine plus the Network Information API's `type`, which only Chromium on Android and
// ChromeOS report (desktop Chrome, Safari and the macOS WebView have no navigator.connection.type).
// capacitor-plugins/network/src/web.ts also maps `effectiveType` ("4g" → wifi), but that is a
// speed estimate, not the medium, so it is not used here. onLine true means a network interface
// is up, not that the internet is reachable.

interface NetworkInformation extends EventTarget {
  type?: string;
}

function connection(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

export function readStatus(): NetworkStatus {
  const connected = navigator.onLine !== false;
  if (!connected) return { connected, type: "none" };
  const types: Record<string, ConnectionType> = { wifi: "wifi", cellular: "cellular", ethernet: "ethernet" };
  return { connected, type: types[connection()?.type ?? ""] ?? "unknown" };
}

export const web = defineWebPlugin<NetworkApi, NetworkEvents>({
  methods: {
    getStatus: async () => readStatus(),
  },
  events: {
    change(emit) {
      let last = readStatus();
      const check = () => {
        const next = readStatus();
        if (next.connected === last.connected && next.type === last.type) return;
        last = next;
        emit(next);
      };
      const info = connection();
      window.addEventListener("online", check);
      window.addEventListener("offline", check);
      info?.addEventListener("change", check);
      return () => {
        window.removeEventListener("online", check);
        window.removeEventListener("offline", check);
        info?.removeEventListener("change", check);
      };
    },
  },
});
