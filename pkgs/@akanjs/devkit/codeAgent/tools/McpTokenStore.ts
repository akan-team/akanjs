import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { akanCodePaths } from "../agent/akanCodePaths";

export interface McpStoredAuth {
  /** The authorization server that minted it, so a server that moves issuer invalidates rather than misuses it. */
  issuer: string;
  /** Kept with the token so a refresh at connect costs no discovery round trip before the first tool call. */
  tokenEndpoint: string;
  /** RFC 8707: what the token was minted for, which a refresh has to restate. */
  resource: string;
  clientId: string;
  clientSecret?: string;
  /** Registered with the client, so a later sign-in binds the same loopback port or registers again. */
  redirectUri: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. Absent when the server issued no lifetime, which the spec allows and means "until refused". */
  expiresAt?: number;
  scope?: string;
}

export interface McpTokenOwner {
  name: string;
  url?: string | undefined;
}

interface McpTokenEntry extends McpStoredAuth {
  name: string;
  origin: string;
}

// Home directory only, mode 0600: `.akan/code/mcp.json` is shared with the editors and routinely committed.
// Keyed by the server's origin, not its name: a workspace `mcp.json` can give a known name any url.
export class McpTokenStore {
  static file() {
    return akanCodePaths.mcpAuthFile();
  }

  static lockFile() {
    return `${McpTokenStore.file()}.lock`;
  }

  static read(owner: McpTokenOwner): McpStoredAuth | undefined {
    const origin = McpTokenStore.#originOf(owner.url);
    if (!origin) return undefined;
    const here = McpTokenStore.#all().filter((entry) => entry.origin === origin);
    const entry = here.find((candidate) => candidate.name === owner.name) ?? here[0];
    if (!entry) return undefined;
    const { name: _name, origin: _origin, ...auth } = entry;
    return auth;
  }

  static names() {
    return [...new Set(McpTokenStore.#all().map((entry) => entry.name))];
  }

  /** Re-reads right before writing, or two concurrent sign-ins each drop the other's token. */
  static write(owner: McpTokenOwner, auth: McpStoredAuth) {
    const origin = McpTokenStore.#originOf(owner.url);
    if (!origin) throw new Error(`"${owner.name}" has no http(s) url to bind its token to.`);
    const kept = McpTokenStore.#all().filter(
      (entry) => entry.origin !== origin || (entry.issuer !== auth.issuer && entry.name !== owner.name),
    );
    McpTokenStore.#save([...kept, { ...auth, name: owner.name, origin }]);
  }

  static clear(name: string) {
    const all = McpTokenStore.#all();
    const kept = all.filter((entry) => entry.name !== name);
    if (kept.length === all.length) return false;
    McpTokenStore.#save(kept);
    return true;
  }

  static isExpired(auth: McpStoredAuth) {
    return auth.expiresAt !== undefined && auth.expiresAt <= Date.now() + McpTokenStore.skewMs;
  }

  /** A token is treated as spent this long before it actually is, so a call never races its own expiry. */
  static readonly skewMs = 60_000;

  static #originOf(url: string | undefined) {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
    } catch {
      return undefined;
    }
  }

  static #keyOf(entry: McpTokenEntry) {
    return `${entry.origin} ${entry.issuer}`;
  }

  static #all(): McpTokenEntry[] {
    const file = McpTokenStore.file();
    if (!existsSync(file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        tokens?: Record<string, McpTokenEntry>;
        servers?: Record<string, McpStoredAuth>;
      };
      if (parsed.tokens) return Object.values(parsed.tokens);
      // An older build keyed by name alone; its resource is the url the token was minted for, so it keeps that origin.
      return Object.entries(parsed.servers ?? {}).flatMap(([name, auth]) => {
        const origin = McpTokenStore.#originOf(auth.resource);
        return origin ? [{ ...auth, name, origin }] : [];
      });
    } catch {
      return [];
    }
  }

  static #save(entries: McpTokenEntry[]) {
    const file = McpTokenStore.file();
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tokens = Object.fromEntries(entries.map((entry) => [McpTokenStore.#keyOf(entry), entry]));
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ tokens }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
    // `rename` keeps the temp file's mode, but an existing target written by an older build may be looser.
    chmodSync(file, 0o600);
  }
}
