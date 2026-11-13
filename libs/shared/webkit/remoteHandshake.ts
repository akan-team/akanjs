export interface RemoteWindow {
  go: (url: string) => void;
  close: () => void;
}

// The sign-in at another server happens in a window of its own; this is how that window and the page that opened it
// find each other. Same-origin only: a BroadcastChannel reaches no other site.
export class RemoteHandshake {
  static readonly #channel = "akan-remote";

  //? Opened blank inside the click, before the address is known: a window opened after an await is a blocked pop-up.
  static reserve(): RemoteWindow | null {
    const opened = window.open("", "_blank", "popup,width=520,height=720");
    if (!opened) return null;
    return {
      go: (url) => {
        opened.location.href = url;
      },
      close: () => opened.close(),
    };
  }

  static announce(url: string) {
    const channel = new BroadcastChannel(RemoteHandshake.#channel);
    channel.postMessage({ url });
    channel.close();
  }

  /** Calls back for every connection made to `url`'s host, until the returned function is called. */
  static listen(url: string, onConnected: () => void): () => void {
    const host = URL.parse(url)?.host ?? url;
    const channel = new BroadcastChannel(RemoteHandshake.#channel);
    channel.onmessage = (event: MessageEvent<{ url?: unknown }>) => {
      const announced = typeof event.data?.url === "string" ? URL.parse(event.data.url)?.host : undefined;
      if (announced === host) onConnected();
    };
    return () => channel.close();
  }
}
