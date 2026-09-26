import { hostname } from "node:os";
import { dayjs } from "akanjs/base";
import { adapt } from "../adapt";
import { CacheAdaptorRole } from "./role.adaptor";

/** The scheduler's own job handle, so the cron backend stays behind this interface. `Bun.cron` satisfies it. */
export interface AkanCronJob {
  readonly cron: string;
  stop(): void;
}

export interface ScheduleAdaptor {
  getCron(key: string): AkanCronJob | undefined;
  registerCron(key: string, cronStr: string, callback: () => Promise<void>, option?: { lock?: boolean }): AkanCronJob;
  unregisterCron(key: string): void;
  getInterval(key: string): NodeJS.Timeout | undefined;
  registerInterval(
    key: string,
    scheduleTime: number,
    callback: () => Promise<void>,
    option?: { lock?: boolean },
  ): NodeJS.Timeout;
  unregisterInterval(key: string): void;
  getTimeout(key: string): NodeJS.Timeout | undefined;
  registerTimeout(
    key: string,
    timeout: number,
    callback: () => Promise<void>,
    option?: { lock?: boolean },
  ): NodeJS.Timeout;
  unregisterTimeout(key: string): void;
  getInit(key: string): (() => Promise<void>) | undefined;
  registerInit(key: string, callback: () => Promise<void>, option?: { once?: boolean }): void;
  unregisterInit(key: string): void;
  _runInit(): Promise<void>;
  getDestroy(key: string): (() => Promise<void>) | undefined;
  registerDestroy(key: string, callback: () => Promise<void>): void;
  unregisterDestroy(key: string): void;
  _runDestroy(): Promise<void>;
}

export class Scheduler
  extends adapt("scheduler", ({ plug }) => ({
    cache: plug(CacheAdaptorRole),
  }))
  implements ScheduleAdaptor
{
  //* Every instance of an app shares its cache, and a lease there is what lets one instance run a cron tick, an
  //* interval period or a `once` init while the others skip it. `lockMap` still keeps a job from overlapping itself
  //* inside one process.
  static readonly #topic = "akan:schedule";
  static readonly #minuteMs = 60_000;
  static readonly #runningLeaseMs = 30_000;
  readonly #owner = `${hostname()}-${process.pid}-${Bun.randomUUIDv7()}`;
  readonly lockMap = new Map<string, boolean>();
  readonly cronMap = new Map<string, AkanCronJob>();
  readonly intervalMap = new Map<string, NodeJS.Timeout>();
  readonly timeoutMap = new Map<string, NodeJS.Timeout>();
  readonly initMap = new Map<string, () => Promise<void>>();
  readonly destroyMap = new Map<string, () => Promise<void>>();
  getCron(key: string) {
    return this.cronMap.get(key);
  }
  registerCron(key: string, cronStr: string, callback: () => Promise<void>, { lock = true }: { lock?: boolean } = {}) {
    // Bun.cron computes the next fire time only after the callback settles, so overlapping runs are
    // impossible and `lock: false` cannot be honoured. The lock below stays to make the skip observable.
    if (!lock) this.logger.warn(`Schedule ${key} requested lock:false, but Bun.cron never overlaps a job`);
    const cron = Bun.cron(cronStr, async () => {
      if (this.lockMap.get(key) && lock) {
        this.logger.warn(`Schedule ${key} is locked, skipped`);
        return;
      }
      try {
        this.lockMap.set(key, true);
        // Bun.cron fires on minute boundaries, so rounding names the same tick on instances whose clocks disagree.
        const tick = Math.round(Date.now() / Scheduler.#minuteMs) * Scheduler.#minuteMs;
        const claimed = await this.cache.setIfAbsent(Scheduler.#topic, `cron:${key}@${tick}`, this.#owner, {
          expireAt: dayjs(tick + 10 * Scheduler.#minuteMs),
        });
        if (!claimed) return;
        const now = Date.now();
        this.logger.debug(`Schedule ${key} started`);
        const ran = await this.#holding(`cron:${key}`, Scheduler.#runningLeaseMs, { release: true }, callback);
        if (!ran) this.logger.warn(`Schedule ${key} is still running on another instance, skipped`);
        else this.logger.debug(`Schedule ${key} finished ${Date.now() - now}ms`);
      } catch (e) {
        this.logger.error(`Schedule ${key} error: ${e}`);
      } finally {
        this.lockMap.delete(key);
      }
    });
    this.cronMap.set(key, cron);
    return cron;
  }
  unregisterCron(key: string) {
    const cron = this.cronMap.get(key);
    if (cron) cron.stop();
    this.cronMap.delete(key);
    this.lockMap.delete(key);
  }
  getInterval(key: string) {
    return this.intervalMap.get(key);
  }
  registerInterval(
    key: string,
    scheduleTime: number,
    callback: () => Promise<void>,
    { lock = true }: { lock?: boolean } = {},
  ) {
    const interval = setInterval(async () => {
      if (this.lockMap.get(key) && lock) {
        this.logger.warn(`Schedule interval ${key} is locked, skipped`);
        return;
      }
      try {
        this.lockMap.set(key, true);
        const now = Date.now();
        // Held for one period and kept, so the next run anywhere is a period later; a locked job also renews it
        // while it runs, so no instance starts it again before it ends.
        const ran = await this.#holding(`interval:${key}`, scheduleTime, { release: false, renew: lock }, callback);
        if (ran) this.logger.debug(`Schedule interval ${key} finished ${Date.now() - now}ms`);
      } catch (e) {
        this.logger.error(`Schedule interval ${key} error: ${e}`);
      } finally {
        this.lockMap.delete(key);
      }
    }, scheduleTime);
    this.intervalMap.set(key, interval);
    return interval;
  }
  unregisterInterval(key: string) {
    const interval = this.intervalMap.get(key);
    if (interval) clearInterval(interval);
    this.intervalMap.delete(key);
    this.lockMap.delete(key);
  }
  getTimeout(key: string) {
    return this.timeoutMap.get(key);
  }
  registerTimeout(key: string, scheduleTime: number, callback: () => Promise<void>) {
    const timeout = setTimeout(async () => {
      try {
        const now = Date.now();
        this.logger.debug(`Schedule timeout ${key} started`);
        await callback();
        this.logger.debug(`Schedule timeout ${key} finished ${Date.now() - now}ms`);
      } catch (e) {
        this.logger.error(`Schedule timeout ${key} error: ${e}`);
      }
    }, scheduleTime);
    this.timeoutMap.set(key, timeout);
    return timeout;
  }
  unregisterTimeout(key: string) {
    const timeout = this.timeoutMap.get(key);
    if (timeout) clearTimeout(timeout);
    this.timeoutMap.delete(key);
    this.lockMap.delete(key);
  }
  getInit(key: string) {
    return this.initMap.get(key);
  }
  registerInit(key: string, callback: () => Promise<void>, { once = false }: { once?: boolean } = {}) {
    this.initMap.set(key, async () => {
      try {
        const now = Date.now();
        this.logger.debug(`Schedule init ${key} started`);
        if (once) await this.#once(key, callback);
        else await callback();
        this.logger.debug(`Schedule init ${key} finished ${Date.now() - now}ms`);
      } catch (e) {
        this.logger.error(`Schedule init ${key} error: ${e}`);
      }
    });
  }
  unregisterInit(key: string) {
    this.initMap.delete(key);
  }
  async _runInit() {
    await Promise.all([...this.initMap.values()].map((callback) => callback()));
  }
  getDestroy(key: string) {
    return this.destroyMap.get(key);
  }
  registerDestroy(key: string, callback: () => Promise<void>) {
    this.destroyMap.set(key, async () => {
      try {
        const now = Date.now();
        this.logger.debug(`Schedule destroy ${key} started`);
        await callback();
        this.logger.debug(`Schedule destroy ${key} finished ${Date.now() - now}ms`);
      } catch (e) {
        this.logger.error(`Schedule destroy ${key} error: ${e}`);
      }
    });
  }
  unregisterDestroy(key: string) {
    this.destroyMap.delete(key);
  }
  async _runDestroy() {
    await Promise.all([...this.destroyMap.values()].map((callback) => callback()));
  }
  /** Runs `run` under `lease`, and answers false without running it when another instance holds the lease. */
  async #holding(
    lease: string,
    ttlMs: number,
    { release, renew = true }: { release: boolean; renew?: boolean },
    run: () => Promise<void>,
  ) {
    if (!(await this.cache.acquireLease(Scheduler.#topic, lease, this.#owner, ttlMs))) return false;
    const stopRenewing = renew ? this.#renewing(lease, ttlMs) : null;
    try {
      await run();
      return true;
    } finally {
      stopRenewing?.();
      if (release) await this.cache.releaseLease(Scheduler.#topic, lease, this.#owner);
    }
  }
  #renewing(lease: string, ttlMs: number) {
    const timer = setInterval(
      () => {
        void this.cache
          .renewLease(Scheduler.#topic, lease, this.#owner, ttlMs)
          .catch((e: unknown) => this.logger.warn(`Schedule lease ${lease} was not renewed: ${String(e)}`));
      },
      Math.max(ttlMs / 3, 10),
    );
    return () => clearInterval(timer);
  }
  // One instance at a time. One that waited for another's run lets that run stand for it — concurrent boots create
  // the root admin once — while one that found nobody running it runs its own, as a restart of a single instance does.
  async #once(key: string, run: () => Promise<void>) {
    const lease = `init:${key}`;
    let waited = false;
    while (!(await this.cache.acquireLease(Scheduler.#topic, lease, this.#owner, Scheduler.#runningLeaseMs))) {
      waited = true;
      await Bun.sleep(250);
    }
    const stopRenewing = this.#renewing(lease, Scheduler.#runningLeaseMs);
    try {
      if (waited && (await this.cache.get(Scheduler.#topic, `${lease}:done`))) return;
      await run();
      await this.cache.set(Scheduler.#topic, `${lease}:done`, this.#owner, { expireAt: dayjs().add(1, "minute") });
    } finally {
      stopRenewing();
      await this.cache.releaseLease(Scheduler.#topic, lease, this.#owner);
    }
  }
  override async onDestroy() {
    for (const cron of this.cronMap.values()) cron.stop();
    for (const interval of this.intervalMap.values()) clearInterval(interval);
    for (const timeout of this.timeoutMap.values()) clearTimeout(timeout);
    this.cronMap.clear();
    this.intervalMap.clear();
    this.timeoutMap.clear();
    this.initMap.clear();
    this.destroyMap.clear();
    this.lockMap.clear();
  }
}
