import { createOpaqueToken } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import type { CacheDatabase } from "akanjs/document";

export class CacheLock {
  static readonly attempts = 40;
  static readonly retryMs = 25;
  readonly #cache: CacheDatabase;
  readonly #topic: string;
  constructor(cache: CacheDatabase, topic: string) {
    this.#cache = cache;
    this.#topic = topic;
  }
  //? Keys are taken in sorted order, so two holders of overlapping sets never wait on each other's half.
  async hold<T>(keys: string[], fn: () => Promise<T>) {
    const owners = new Map<string, string | null>();
    for (const key of [...new Set(keys)].sort()) owners.set(key, await this.#acquire(key));
    try {
      return await fn();
    } finally {
      for (const [key, owner] of owners) await this.#release(key, owner);
    }
  }
  //? Past a second of waiting the holder goes ahead unlocked: a lost write is worse than a rare race.
  async #acquire(key: string) {
    const owner = createOpaqueToken(8);
    for (let attempt = 0; attempt < CacheLock.attempts; attempt++) {
      if (await this.#cache.setIfAbsent(this.#topic, key, owner, { expireAt: dayjs().add(5, "second") })) return owner;
      await new Promise((resolve) => setTimeout(resolve, CacheLock.retryMs));
    }
    return null;
  }
  async #release(key: string, owner: string | null) {
    if (owner && (await this.#cache.get<string>(this.#topic, key)) === owner)
      await this.#cache.delete(this.#topic, key);
  }
}
