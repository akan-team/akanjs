import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

interface HeldLock {
  token: string | null;
  ino: number;
  bornAt: number;
}

type FsNow = () => Promise<number | null>;

export class CliBuildLock {
  //? Counted from when the holder took it: a cold build fits, and a hung holder or a reused pid cannot wedge the CLI.
  static readonly #leaseMs = 120_000;
  static readonly #pollMs = 100;
  static readonly #releaseTries = 5;
  static readonly #transientMs = 3_000;
  //? Windows answers EPERM or EBUSY for a path whose deletion is pending while another process still holds it open.
  static readonly #transientCodes = new Set(["EPERM", "EBUSY"]);

  static async acquire(lockDir: string): Promise<() => Promise<void>> {
    await mkdir(path.dirname(lockDir), { recursive: true });
    const fsNow = CliBuildLock.#fsClockBeside(lockDir);
    for (;;) {
      const held = await CliBuildLock.#heldAt(lockDir);
      if (!held) {
        const token = `${process.pid}\n${crypto.randomUUID()}\n${Date.now()}`;
        if (await CliBuildLock.#create(lockDir, token)) {
          await CliBuildLock.#sweep(lockDir, fsNow);
          return async () => await CliBuildLock.#release(lockDir, token, fsNow);
        }
      } else if (
        !(await CliBuildLock.#isAbandoned(lockDir, held, fsNow)) ||
        !(await CliBuildLock.#removeIf(lockDir, (now) => CliBuildLock.#isSame(now, held), fsNow))
      )
        await Bun.sleep(CliBuildLock.#pollMs);
    }
  }

  static async #create(lockDir: string, token: string): Promise<boolean> {
    if (!(await CliBuildLock.#makeDir(lockDir))) return false;
    await Bun.write(path.join(lockDir, "owner"), token);
    return true;
  }

  static async #release(lockDir: string, token: string, fsNow: FsNow): Promise<void> {
    const giveUpAt = Date.now() + CliBuildLock.#transientMs;
    for (let attempt = 0; attempt < CliBuildLock.#releaseTries; attempt++) {
      const isOurs = (now: HeldLock) => now.token === token;
      const removed = await CliBuildLock.#removeIf(lockDir, isOurs, fsNow, giveUpAt).catch(() => false);
      if (removed || (await CliBuildLock.#heldAt(lockDir))?.token !== token) return;
      await Bun.sleep(CliBuildLock.#pollMs);
    }
    console.warn(`[cli-build] could not release ${lockDir}; the next build takes it over when its lease ends`);
  }

  //? Removals of one lock take turns, or a late remover could move away the new holder's lock that replaced it.
  static async #removeIf(
    lockDir: string,
    isTarget: (held: HeldLock) => boolean,
    fsNow: FsNow,
    giveUpAt?: number,
  ): Promise<boolean> {
    const judged = await CliBuildLock.#heldAt(lockDir);
    if (!judged || !isTarget(judged)) return false;
    const markerOf = (attempt: number) => `${lockDir}.removing-${CliBuildLock.#keyOf(judged)}.${attempt}`;
    for (let attempt = 0; ; attempt++) {
      if (!(await CliBuildLock.#makeDir(markerOf(attempt), giveUpAt))) {
        if (await CliBuildLock.#isStale(markerOf(attempt), fsNow)) continue;
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
        for (let done = 0; done <= attempt; done++)
          await rm(markerOf(done), { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  static async #makeDir(dir: string, giveUpAt = Date.now() + CliBuildLock.#transientMs): Promise<boolean> {
    for (;;) {
      try {
        await mkdir(dir);
        return true;
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        const taken =
          code === "EEXIST" ||
          (await stat(dir)
            .then(() => true)
            .catch(() => false));
        if (taken) return false;
        if (!CliBuildLock.#transientCodes.has(code) || Date.now() > giveUpAt) throw error;
        await Bun.sleep(CliBuildLock.#pollMs);
      }
    }
  }

  static async #sweep(lockDir: string, fsNow: FsNow): Promise<void> {
    const dir = path.dirname(lockDir);
    const leftovers = [".removing-", ".removed-", ".clock-"].map((kind) => `${path.basename(lockDir)}${kind}`);
    const siblings = await readdir(dir).catch((): string[] => []);
    for (const sibling of siblings) {
      if (!leftovers.some((prefix) => sibling.startsWith(prefix))) continue;
      const leftover = path.join(dir, sibling);
      if (await CliBuildLock.#isStale(leftover, fsNow))
        await rm(leftover, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  static async #heldAt(lockDir: string): Promise<HeldLock | null> {
    const info = await stat(lockDir).catch(() => null);
    if (!info) return null;
    const token = await Bun.file(path.join(lockDir, "owner"))
      .text()
      .then((text) => text || null)
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

  //? File times come from the filesystem's clock, which on a network mount or WSL's /mnt/c can sit minutes off ours.
  static #fsClockBeside(lockDir: string): FsNow {
    let offset: Promise<number | null> | undefined;
    return async () => {
      offset ??= CliBuildLock.#fsOffset(lockDir);
      const measured = await offset;
      if (measured === null) offset = undefined;
      return measured === null ? null : Date.now() + measured;
    };
  }

  //? A failed probe leaves ages unknown: falling back to this process's clock is the skew the probe exists to avoid.
  static async #fsOffset(lockDir: string): Promise<number | null> {
    const probe = `${lockDir}.clock-${crypto.randomUUID()}`;
    const before = Date.now();
    try {
      await mkdir(probe);
      const info = await stat(probe);
      return (info.birthtimeMs || info.mtimeMs) - before;
    } catch {
      return null;
    } finally {
      await rm(probe, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  //? A removal takes milliseconds, so a marker past the lease is a dead or frozen remover's and later removers pass it.
  static async #isStale(entry: string, fsNow: FsNow): Promise<boolean> {
    const info = await stat(entry).catch(() => null);
    return !!info && CliBuildLock.#outlived(await CliBuildLock.#ageOf(info.birthtimeMs || info.mtimeMs, fsNow));
  }

  static async #ageOf(bornAt: number, fsNow: FsNow): Promise<number | null> {
    const now = await fsNow();
    return now === null ? null : now - bornAt;
  }

  //? A clock set back past the lease counts too, or the lock would stay held until the clock caught up.
  static #outlived(heldFor: number | null): heldFor is number {
    return heldFor !== null && Math.abs(heldFor) > CliBuildLock.#leaseMs;
  }

  static async #isAbandoned(lockDir: string, { token, bornAt }: HeldLock, fsNow: FsNow): Promise<boolean> {
    const [pid, , takenAt] = token?.split("\n") ?? [];
    const takenAtMs = Number(takenAt);
    const heldFor = takenAtMs ? Date.now() - takenAtMs : await CliBuildLock.#ageOf(bornAt, fsNow);
    if (CliBuildLock.#outlived(heldFor)) {
      const age = heldFor < 0 ? `taken ${Math.round(-heldFor)}ms ahead of this clock` : `held ${Math.round(heldFor)}ms`;
      console.warn(`[cli-build] taking over ${lockDir}, ${age}`);
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
