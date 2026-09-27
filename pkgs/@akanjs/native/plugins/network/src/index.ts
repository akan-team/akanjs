import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/** The medium of the active network. "unknown" for others (VPN only, Bluetooth, USB) or where the host cannot tell. */
export type ConnectionType = "wifi" | "cellular" | "ethernet" | "none" | "unknown";

export interface NetworkStatus {
  /**
   * Whether the active network can reach the internet, as far as the OS knows. Android requires a
   * validated connection, so a captive portal Wi-Fi is not connected there. iOS and browsers only
   * know that a route exists.
   */
  connected: boolean;
  /** "none" only when there is no network at all; a Wi-Fi without internet is { connected: false, type: "wifi" }. */
  type: ConnectionType;
}

export interface NetworkApi {
  getStatus(): Promise<NetworkStatus>;
}

export interface NetworkEvents {
  /** Sent when `connected` or `type` changes. */
  change: NetworkStatus;
}

export const network = definePlugin<NetworkApi, NetworkEvents>("network", {
  methods: ["getStatus"],
  events: ["change"],
  web,
});

function guess(): NetworkStatus {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  return { connected: online, type: online ? "unknown" : "none" };
}

const current = createLiveValue<NetworkStatus>(
  guess(),
  (set) => {
    let live = true;
    const stop = network.listen("change", set);
    network
      .getStatus()
      .then((status) => live && set(status))
      .catch(() => {});
    return () => {
      live = false;
      stop();
    };
  },
  shallowEqual,
);

/** The current network status. Re-renders on every change. */
export function useNetwork(): NetworkStatus {
  return useLiveValue(current);
}
