import { dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { CacheAdaptor } from "akanjs/service";

export type McpFoundToolsStore = Pick<CacheAdaptor, "get" | "set">;

// Per caller, not per connection: the modern era has no session. Without the app's cache it is this process's alone.
export class McpFoundTools {
  static readonly logger = new Logger("McpFoundTools");
  static readonly ttlMs = 24 * 60 * 60 * 1000;
  static readonly perCaller = 64;
  static readonly memoryCallers = 5_000;
  static readonly #topic = "mcpFound";

  readonly #store: McpFoundToolsStore | null;
  readonly #memory = new Map<string, { names: string[]; expiresAt: number }>();
  #failing = false;

  constructor(store: McpFoundToolsStore | null) {
    this.#store = store;
  }

  async of(caller: string): Promise<string[]> {
    if (this.#store) {
      try {
        const names = await this.#store.get<string[]>(McpFoundTools.#topic, caller);
        this.#failing = false;
        return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
      } catch (error) {
        this.#warn(error);
      }
    }
    const held = this.#memory.get(caller);
    if (!held) return [];
    if (held.expiresAt > Date.now()) return held.names;
    this.#memory.delete(caller);
    return [];
  }

  /** Whether any of `names` was not found before, which is when the caller's listing changed. */
  async add(caller: string, names: string[]): Promise<boolean> {
    const before = await this.of(caller);
    const added = names.filter((name) => !before.includes(name));
    if (!added.length) return false;
    const kept = [...before, ...added].slice(-McpFoundTools.perCaller);
    if (this.#store) {
      try {
        await this.#store.set(McpFoundTools.#topic, caller, kept, {
          expireAt: dayjs().add(McpFoundTools.ttlMs, "millisecond"),
        });
        this.#failing = false;
        return true;
      } catch (error) {
        this.#warn(error);
      }
    }
    this.#memory.delete(caller);
    this.#memory.set(caller, { names: kept, expiresAt: Date.now() + McpFoundTools.ttlMs });
    const oldest = this.#memory.keys().next().value;
    if (this.#memory.size > McpFoundTools.memoryCallers && oldest !== undefined) this.#memory.delete(oldest);
    return true;
  }

  #warn(error: unknown) {
    const first = !this.#failing;
    this.#failing = true;
    if (first)
      McpFoundTools.logger.warn(`MCP keeps found tools in this process while the cache fails: ${String(error)}`);
  }
}
