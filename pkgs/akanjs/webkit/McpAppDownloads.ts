"use client";
import { Binary } from "akanjs/base";
import type { McpAppBridge, McpDownloadContent } from "./McpAppBridge";

export class McpAppDownloads {
  readonly #bridge: McpAppBridge;
  readonly #resolve: (href: string) => URL | null;
  readonly #blobs = new Map<string, Blob>();

  constructor(bridge: McpAppBridge, resolve: (href: string) => URL | null) {
    this.#bridge = bridge;
    this.#resolve = resolve;
  }

  // The sandbox has no `allow-downloads`, so a file is handed to the host to save. Its bytes are read here: the host
  // cannot reach a `blob:` URL, and a data or blob read by `fetch` is a connection the view's CSP refuses.
  async save(href: string, suggested: string | null) {
    const content = await this.#downloadOf(href, suggested || null);
    if (!content) throw new Error("it is neither a web address nor a file this view made");
    if (this.#bridge.hostCapabilities.downloadFile) await this.#bridge.downloadFile([content]);
    else if (content.type === "resource_link") await this.#bridge.openLink(content.uri);
    else throw new Error("this host does not save files");
  }

  async #downloadOf(href: string, suggested: string | null): Promise<McpDownloadContent | null> {
    const blob = this.#blobs.get(href) ?? (href.startsWith("data:") ? McpAppDownloads.#dataBlob(href) : null);
    if (blob) {
      const name = suggested ?? "download";
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        type: "resource",
        resource: {
          uri: `file:///${encodeURIComponent(name)}`,
          mimeType: blob.type || "application/octet-stream",
          blob: Binary.toBase64(bytes),
        },
      };
    }
    const url = this.#resolve(href);
    if (!url || !["http:", "https:"].includes(url.protocol)) return null;
    return { type: "resource_link", uri: url.href, name: suggested ?? url.pathname.split("/").at(-1) ?? "download" };
  }

  //? `downloadBlob` revokes its URL right after the click, so the blob is held from the moment the URL is made.
  keepBlobs() {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) this.#blobs.set(url, object);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      this.#blobs.delete(url);
      revoke(url);
    };
  }

  static #dataBlob(href: string) {
    const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(href);
    if (!match) return null;
    const [, type = "", base64, body = ""] = match;
    const bytes = base64 ? Binary.fromBase64(body) : new TextEncoder().encode(decodeURIComponent(body));
    return new Blob([bytes], { type: type.split(";")[0] });
  }
}
