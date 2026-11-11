import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

interface HeldLock {
  token: string | null;
  ino: number;
  bornAt: number;
}

export class CliBuildLock {
  //? Counted from when the holder took it: a cold build fits, and a hung holder or a reused pid cannot wedge the CLI.
  static readonly #leaseMs = 120_000;
  static readonly #pollMs = 100;
  static readonly #releaseTries = 5;

  static async acquire(lockDir: string): Promise<() => Promise<void>> {
    await mkdir(path.dirname(lockDir), { recursive: true });
    for (;;) {
      const held = await CliBuildLock.#heldAt(lockDir);
      if (!held) {
        const token = `${process.pid}\n${crypto.randomUUID()}\n${Date.now()}`;
        if (await CliBuildLock.#create(lockDir, token)) {
          await CliBuildLock.#sweep(lockDir);
          return async () => await CliBuildLock.#release(lockDir, token);
        }
      } else if (
        !CliBuildLock.#isAbandoned(lockDir, held) ||
        !(await CliBuildLock.#removeIf(lockDir, (now) => CliBuildLock.#isSame(now, held)))
      )
        await Bun.sleep(CliBuildLock.#pollMs);
    }
  }

  static async #create(lockDir: string, token: string): Promise<boolean> {
    if (!(await CliBuildLock.#makeDir(lockDir))) return false;
    await Bun.write(path.join(lockDir, "owner"), token);
    return true;
  }

  static async #release(lockDir: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < CliBuildLock.#releaseTries; attempt++) {
      const removed = await CliBuildLock.#removeIf(lockDir, (now) => now.token === token).catch(() => false);
      if (removed || (await CliBuildLock.#heldAt(lockDir))?.token !== token) return;
      await Bun.sleep(CliBuildLock.#pollMs);
    }
    console.warn(`[cli-build] could not release ${lockDir}; the next build takes it over when its lease ends`);
  }

  //? One lock's removals take turns under a marker named by its token, or inode and birth time while it has no owner.
  static async #removeIf(lockDir: string, isTarget: (held: HeldLock) => boolean): Promise<boolean> {
    const judged = await CliBuildLock.#heldAt(lockDir);
    if (!judged || !isTarget(judged)) return false;
    const markerOf = (attempt: number) => `${lockDir}.removing-${CliBuildLock.#keyOf(judged)}.${attempt}`;
    for (let attempt = 0; ; attempt++) {
      if (!(await CliBuildLock.#makeDir(markerOf(attempt)))) {
        if (await CliBuildLock.#isStale(markerOf(attempt))) continue;
        return false;
      }
      try {
        const held = await CliBuildLock.#heldAt(lockDir);
        if (!held || !isTarget(held)) return false;
        const tombstone = `${lockDir}.removed-${crypto.randomUUID()}`;
        //? Windows refuses to rename a folder while a file in it is open, as every waiter's poll and AV scans do.
        const moved = await rename(lockDir, tombstone)
          .then(() => true)
          .catch(() => false);
        if (moved) await rm(tombstone, { recursive: true, force: true }).catch(() => undefined);
        return moved;
      } finally {
        for (let done = 0; done <= attempt; done++) await rm(markerOf(done), { recursive: true, force: true });
      }
    }
  }

  static async #makeDir(dir: string): Promise<boolean> {
    try {
      await mkdir(dir);
      return true;
    } catch (error) {
      const taken =
        (error as { code?: string }).code === "EEXIST" ||
        (await stat(dir)
          .then(() => true)
          .catch(() => false));
      if (taken) return false;
      throw error;
    }
  }

  static async #sweep(lockDir: string): Promise<void> {
    const dir = path.dirname(lockDir);
    const leftovers = [".removing-", ".removed-"].map((kind) => `${path.basename(lockDir)}${kind}`);
    const siblings = await readdir(dir).catch((): string[] => []);
    for (const sibling of siblings) {
      if (!leftovers.some((prefix) => sibling.startsWith(prefix))) continue;
      const leftover = path.join(dir, sibling);
      if (await CliBuildLock.#isStale(leftover))
        await rm(leftover, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  static async #heldAt(lockDir: string): Promise<HeldLock | null> {
    const info = await stat(lockDir).catch(() => null);
    if (!info) return null;
    const token = await Bun.file(path.join(lockDir, "owner"))
      .text()
      .catch(() => null);
    return { token, ino: info.ino, bornAt: info.birthtimeMs || info.mtimeMs };
  }

  static #keyOf({ token, ino, bornAt }: HeldLock): string {
    return Bun.hash(token ?? `${ino}:${bornAt}`).toString(36);
  }

  static #isSame(now: HeldLock, judged: HeldLock): boolean {
    if (judged.token !== null) return now.token === judged.token;
    return now.token === null && now.ino === judged.ino && now.bornAt === judged.bornAt;
  }

  //? A removal takes milliseconds, so a marker past the lease is a dead or frozen remover's and later removers pass it.
  static async #isStale(entry: string): Promise<boolean> {
    const info = await stat(entry).catch(() => null);
    return !!info && CliBuildLock.#outlived(info.birthtimeMs || info.mtimeMs);
  }

  //? A clock set back past the lease counts too, or the lock would stay held until the clock caught up.
  static #outlived(since: number): boolean {
    return Math.abs(Date.now() - since) > CliBuildLock.#leaseMs;
  }

  static #isAbandoned(lockDir: string, { token, bornAt }: HeldLock): boolean {
    const [pid, , takenAt] = token?.split("\n") ?? [];
    const since = Number(takenAt) || bornAt;
    if (CliBuildLock.#outlived(since)) {
      console.warn(`[cli-build] taking over ${lockDir}, held for ${Math.round(Date.now() - since)}ms`);
      return true;
    }
    const owner = Number(pid);
    if (!Number.isFinite(owner) || owner <= 0) return false;
    try {
      process.kill(owner, 0);
      return false;
    } catch (error) {
      // ESRCH is the only code that means gone — EPERM is a live process owned by someone else.
      return (error as { code?: string }).code === "ESRCH";
    }
  }
}
