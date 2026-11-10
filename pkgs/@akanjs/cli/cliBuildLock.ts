import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export class CliBuildLock {
  /** Covers a cold build on a loaded machine; short enough that a lock leaked by `kill -9` cannot wedge the CLI. */
  static readonly #timeoutMs = 120_000;
  static readonly #pollMs = 100;

  static async acquire(lockDir: string): Promise<() => Promise<void>> {
    await mkdir(path.dirname(lockDir), { recursive: true });
    const token = `${process.pid}\n${crypto.randomUUID()}`;
    const waitingSince = Date.now();
    for (;;) {
      const acquired = await mkdir(lockDir)
        .then(() => true)
        .catch(() => false);
      if (acquired) {
        await Bun.write(path.join(lockDir, "owner"), token);
        return async () => {
          if ((await CliBuildLock.#ownerOf(lockDir)) === token) await rm(lockDir, { recursive: true, force: true });
        };
      }
      const owner = await CliBuildLock.#ownerOf(lockDir);
      if (CliBuildLock.#isAbandoned(lockDir, owner, waitingSince)) await CliBuildLock.takeOver(lockDir, owner);
      else await Bun.sleep(CliBuildLock.#pollMs);
    }
  }

  //? Two waiters can judge one dead lock abandoned; the later one must not delete the lock the earlier one made since.
  static async takeOver(lockDir: string, abandonedOwner: string | null): Promise<void> {
    const tombstone = `${lockDir}.stale-${crypto.randomUUID()}`;
    const moved = await rename(lockDir, tombstone)
      .then(() => true)
      .catch(() => false);
    if (!moved) return;
    if ((await CliBuildLock.#ownerOf(tombstone)) !== abandonedOwner) {
      const restored = await rename(tombstone, lockDir)
        .then(() => true)
        .catch(() => false);
      if (restored) return;
    }
    await rm(tombstone, { recursive: true, force: true });
  }

  static async #ownerOf(lockDir: string): Promise<string | null> {
    return await Bun.file(path.join(lockDir, "owner"))
      .text()
      .catch(() => null);
  }

  static #isAbandoned(lockDir: string, owner: string | null, waitingSince: number): boolean {
    if (Date.now() - waitingSince > CliBuildLock.#timeoutMs) {
      console.warn(`[cli-build] taking over ${lockDir} after waiting ${CliBuildLock.#timeoutMs}ms`);
      return true;
    }
    const pid = Number(owner?.split("\n")[0]);
    // Not yet written: the holder is between its `mkdir` and its owner write, which is not abandoned.
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      // ESRCH is the only code that means gone — EPERM is a live process owned by someone else.
      return (error as { code?: string }).code === "ESRCH";
    }
  }
}
