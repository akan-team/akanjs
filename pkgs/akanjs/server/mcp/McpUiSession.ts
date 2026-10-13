import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Logger } from "akanjs/common";
import type { CacheAdaptor } from "akanjs/service";

export type McpUiSessionStore = Pick<CacheAdaptor, "get" | "setIfAbsent">;

// Security: a legacy request is from a client that renders views only if it names an id this app signed at an
// `initialize` declaring the extension. Signed, not stored: requests go round-robin, and the cache shares the key.
export class McpUiSession {
  static readonly logger = new Logger("McpUiSession");
  static readonly prefix = "ui.";
  static readonly #topic = "mcpUiSession";
  // Without a cache, a session one router issued must still verify on another router in the process.
  static readonly #processKey = randomBytes(32).toString("base64url");

  readonly #store: McpUiSessionStore | null;
  #key: Promise<string> | null = null;
  #unavailable = false;

  constructor(store: McpUiSessionStore | null) {
    this.#store = store;
  }

  async mint(): Promise<string | null> {
    const key = await this.#keyOrNull();
    if (!key) return null;
    const nonce = randomBytes(16).toString("base64url");
    return `${McpUiSession.prefix}${nonce}.${McpUiSession.#sign(key, nonce)}`;
  }

  async issued(id: string | null | undefined): Promise<boolean> {
    if (!id?.startsWith(McpUiSession.prefix)) return false;
    const [nonce, signature, ...rest] = id.slice(McpUiSession.prefix.length).split(".");
    if (!nonce || !signature || rest.length) return false;
    const key = await this.#keyOrNull();
    if (!key) return false;
    const expected = Buffer.from(McpUiSession.#sign(key, nonce));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  static #sign(key: string, nonce: string) {
    return createHmac("sha256", key).update(nonce).digest("base64url");
  }

  // A cache that cannot answer issues no session and honours none: the client is served as one without views.
  async #keyOrNull(): Promise<string | null> {
    this.#key ??= this.#load();
    try {
      const key = await this.#key;
      this.#unavailable = false;
      return key;
    } catch (error) {
      this.#key = null;
      if (!this.#unavailable)
        McpUiSession.logger.warn(`MCP Apps sessions are refused until the cache answers: ${String(error)}`);
      this.#unavailable = true;
      return null;
    }
  }

  async #load(): Promise<string> {
    const store = this.#store;
    if (!store) return McpUiSession.#processKey;
    await store.setIfAbsent(McpUiSession.#topic, "key", randomBytes(32).toString("base64url"));
    const key = await store.get<string>(McpUiSession.#topic, "key");
    if (typeof key !== "string" || !key) throw new Error("the signing key it stored is gone");
    return key;
  }
}
