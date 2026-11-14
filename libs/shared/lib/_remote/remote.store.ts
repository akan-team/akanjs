import { msg } from "@libs/shared/client";
import { RemoteHandshake } from "@libs/shared/webkit";
import { store } from "akanjs/store";

import { fetch } from "../useClient";

export class RemoteStore extends store("remote" as const, () => ({
  remoteCallback: null as { state: string; status: "connecting" | "connected" | "failed" } | null,
})) {
  //? A remote that asks for no sign-in is connected by the call itself, and announced as the callback page would.
  async connectRemote(url: string) {
    const popup = RemoteHandshake.reserve();
    if (!popup) {
      msg.error("remote.popupBlocked");
      return;
    }
    try {
      const authorizeUrl = await fetch.connectRemote(url);
      if (authorizeUrl) {
        popup.go(authorizeUrl);
        return;
      }
      popup.close();
      RemoteHandshake.announce(url);
    } catch (error) {
      popup.close();
      throw error;
    }
  }

  //? A dev render mounts the callback twice, and a `state` is answered once: the second mount must not ask again.
  async completeRemoteConnection(state: string, code: string, iss: string | null) {
    if (this.get().remoteCallback?.state === state) return;
    this.set({ remoteCallback: { state, status: "connecting" } });
    try {
      const { url } = await fetch.completeRemoteConnection(state, code, iss);
      this.set({ remoteCallback: { state, status: "connected" } });
      RemoteHandshake.announce(url);
      window.close();
    } catch (error) {
      this.set({ remoteCallback: { state, status: "failed" } });
      throw error;
    }
  }

  //? An action returns nothing, and the frame that asked waits on this one answer, so it is handed over.
  async callRemoteView(
    url: string,
    tool: string,
    args: Record<string, unknown>,
    settle: (result: Record<string, unknown>) => void,
    fail: (error: unknown) => void,
  ) {
    try {
      settle(JSON.parse(await fetch.callRemoteView(url, tool, JSON.stringify(args))) as Record<string, unknown>);
    } catch (error) {
      fail(error);
    }
  }

  async disconnectRemote(url: string) {
    await fetch.disconnectRemote(url);
  }
}
