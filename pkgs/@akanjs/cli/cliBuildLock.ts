import { mkdir, rename, rm, stat } from "node:fs/promises";
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
  //? A removal marker is held for the milliseconds of one removal; one this old was left by a process that died in it.
  static readonly #markerStaleMs = 10_000;

  static async acquire(lockDir: string): Promise<() => Promise<void>> {
    await mkdir(path.dirname(lockDir), { recursive: true });
    for (;;) {
      const held = await CliBuildLock.#heldAt(lockDir);
      if (!held) {
        const token = `${process.pid}\n${crypto.randomUUID()}\n${Date.now()}`;
        if (await CliBuildLock.#create(lockDir, token))
          return async () => {
            await CliBuildLock.#removeIf(lockDir, (now) => now.token === token);
          };
      } else if (
        !CliBuildLock.#isAbandoned(lockDir, held) ||
        !(await CliBuildLock.#removeIf(lockDir, (now) => CliBuildLock.#isSame(now, held)))
      )
        await Bun.sleep(CliBuildLock.#pollMs);
    }
  }

  //? The owner is written before the lock exists: renaming a filled directory onto a lock that exists fails.
  static async #create(lockDir: string, token: string): Promise<boolean> {
    const staged = `${lockDir}.new-${crypto.randomUUID()}`;
    await mkdir(staged);
    await Bun.write(path.join(staged, "owner"), token);
    const created = await rename(staged, lockDir)
      .then(() => true)
      .catch(() => false);
    if (!created) await rm(staged, { recursive: true, force: true });
    return created;
  }

  //? Removals of one lock take turns through a marker named after it, so the lock re-checked under it is the one moved.
  static async #removeIf(lockDir: string, isTarget: (held: HeldLock) => boolean): Promise<boolean> {
    const judged = await CliBuildLock.#heldAt(lockDir);
    if (!judged || !isTarget(judged)) return false;
    const markerOf = (attempt: number) => `${lockDir}.removing-${CliBuildLock.#keyOf(judged)}.${attempt}`;
    for (let attempt = 0; ; attempt++) {
      const marked = await mkdir(markerOf(attempt))
        .then(() => true)
        .catch(() => false);
      if (!marked) {
        if (await CliBuildLock.#isStale(markerOf(attempt))) continue;
        return false;
      }
      try {
        const held = await CliBuildLock.#heldAt(lockDir);
        if (!held || !isTarget(held)) return false;
        const tombstone = `${lockDir}.removed-${crypto.randomUUID()}`;
        await rename(lockDir, tombstone);
        await rm(tombstone, { recursive: true, force: true });
        return true;
      } finally {
        for (let done = 0; done <= attempt; done++) await rm(markerOf(done), { recursive: true, force: true });
      }
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

  static async #isStale(marker: string): Promise<boolean> {
    const info = await stat(marker).catch(() => null);
    return !!info && Date.now() - (info.birthtimeMs || info.mtimeMs) > CliBuildLock.#markerStaleMs;
  }

  static #isAbandoned(lockDir: string, { token, bornAt }: HeldLock): boolean {
    const [pid, , takenAt] = token?.split("\n") ?? [];
    const heldFor = Date.now() - (Number(takenAt) || bornAt);
    if (heldFor > CliBuildLock.#leaseMs) {
      console.warn(`[cli-build] taking over ${lockDir}, held for ${Math.round(heldFor)}ms`);
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
