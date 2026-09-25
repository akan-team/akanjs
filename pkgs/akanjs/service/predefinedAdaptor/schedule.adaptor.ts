import { Cron } from "croner";
import { adapt } from "../adapt";
import { CacheAdaptorRole } from "./role.adaptor";

export interface ScheduleAdaptor {
  getCron(key: string): Cron | undefined;
  registerCron(key: string, cronStr: string, callback: () => Promise<void>, option?: { lock?: boolean }): Cron;
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
  registerInit(key: string, callback: () => Promise<void>): void;
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
  readonly lockMap = new Map<string, boolean>();
  readonly cronMap = new Map<string, Cron>();
  readonly intervalMap = new Map<string, NodeJS.Timeout>();
  readonly timeoutMap = new Map<string, NodeJS.Timeout>();
  readonly initMap = new Map<string, () => Promise<void>>();
  readonly destroyMap = new Map<string, () => Promise<void>>();
  getCron(key: string) {
    return this.cronMap.get(key);
  }
  registerCron(key: string, cronStr: string, callback: () => Promise<void>, { lock = true }: { lock?: boolean } = {}) {
    const cron = new Cron(cronStr, async () => {
      if (this.lockMap.get(key) && lock) {
        this.logger.warn(`Schedule ${key} is locked, skipped`);
        return;
      }
      try {
        this.lockMap.set(key, true);
        const now = Date.now();
        this.logger.debug(`Schedule ${key} started`);
        await callback();
        this.logger.debug(`Schedule ${key} finished ${Date.now() - now}ms`);
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
        this.logger.debug(`Schedule interval ${key} started`);
        await callback();
        this.logger.debug(`Schedule interval ${key} finished ${Date.now() - now}ms`);
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
  registerInit(key: string, callback: () => Promise<void>) {
    this.initMap.set(key, async () => {
      try {
        const now = Date.now();
        this.logger.debug(`Schedule init ${key} started`);
        await callback();
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
