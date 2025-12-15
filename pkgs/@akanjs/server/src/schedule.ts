import type { BackendEnv } from "@akanjs/base";
import { lowerlize } from "@akanjs/common";
import { getAllServiceRefs, getServiceMeta } from "@akanjs/service";
import { getAllSignalRefs, getGqlMetas, getSigMeta, type GqlMeta } from "@akanjs/signal";
import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common";
import { CronJob } from "cron";

export const makeScheduleModule = (serverMode: "federation" | "batch" | "all" | "none", backendEnv: BackendEnv) => {
  const srvRefs = getAllServiceRefs();
  const sigRefs = getAllSignalRefs();

  const initMetas: GqlMeta[] = [];
  const cronMetas: GqlMeta[] = [];
  const intervalMetas: GqlMeta[] = [];
  const timeoutMetas: GqlMeta[] = [];
  const destroyMetas: GqlMeta[] = [];

  sigRefs
    .filter((sigRef) => getSigMeta(sigRef).enabled)
    .forEach((sigRef) => {
      const gqlMetas = getGqlMetas(sigRef);
      gqlMetas.forEach((gqlMeta) => {
        const { enabled, operationMode, serverMode: targetServerMode, scheduleType } = gqlMeta.signalOption;
        if (gqlMeta.type !== "Schedule") return;
        else if (!enabled) return;
        else if (operationMode && !operationMode.includes(backendEnv.operationMode)) return;
        else if (
          targetServerMode &&
          targetServerMode !== "all" &&
          serverMode !== "all" &&
          targetServerMode !== serverMode
        )
          return;
        switch (scheduleType) {
          case "init":
            initMetas.push(gqlMeta);
            break;
          case "cron":
            cronMetas.push(gqlMeta);
            break;
          case "interval":
            intervalMetas.push(gqlMeta);
            break;
          case "timeout":
            timeoutMetas.push(gqlMeta);
            break;
          case "destroy":
            destroyMetas.push(gqlMeta);
            break;
          default:
            break;
        }
      });
    });

  @Injectable()
  class Schedule {
    private readonly logger = new Logger("Schedule");
    #cronMap = new Map<(...args: any[]) => any, CronJob>();
    #timeoutMap = new Map<(...args: any[]) => any, NodeJS.Timeout>();
    #intervalMap = new Map<(...args: any[]) => any, NodeJS.Timeout>();
    #lockMap = new Map<(...args: any[]) => any, boolean>();

    async onModuleInit() {
      await Promise.all(
        initMetas.map(async (gqlMeta) => {
          const fn = gqlMeta.descriptor.value as (...args: any[]) => Promise<void>;
          const before = Date.now();
          this.logger.verbose(`Init Before ${gqlMeta.key} / ${before}`);
          await fn.apply(this);
          const after = Date.now();
          this.logger.verbose(`Init After ${gqlMeta.key} / ${after} (${after - before}ms)`);
        })
      );
      timeoutMetas.forEach((gqlMeta) => {
        const fn = gqlMeta.descriptor.value as (...args: any[]) => Promise<void>;
        const timeout = gqlMeta.signalOption.scheduleTime;
        const timer = setTimeout(async () => {
          const before = Date.now();
          this.logger.verbose(`Timemout Before ${gqlMeta.key} / ${before}`);
          await fn.apply(this);
          const after = Date.now();
          this.logger.verbose(`Timemout After ${gqlMeta.key} / ${after} (${after - before}ms)`);
          this.#timeoutMap.delete(fn);
        }, timeout);
        this.#timeoutMap.set(fn, timer);
      });
      intervalMetas.forEach((gqlMeta) => {
        const lock = gqlMeta.signalOption.lock;
        const fn = gqlMeta.descriptor.value as (...args: any[]) => Promise<void>;
        const interval = gqlMeta.signalOption.scheduleTime;
        const timer = setInterval(async () => {
          if (lock) {
            if (this.#lockMap.get(fn)) {
              this.logger.warn(`${gqlMeta.key} is locked, skipping...`);
              return;
            }
            this.#lockMap.set(fn, true);
          }
          const before = Date.now();
          this.logger.verbose(`Interval Before ${gqlMeta.key} / ${before}`);
          await fn.apply(this);
          const after = Date.now();
          this.logger.verbose(`Interval After ${gqlMeta.key} / ${after} (${after - before}ms)`);
          if (lock) this.#lockMap.set(fn, false);
        }, interval);
        this.#intervalMap.set(fn, timer);
      });
      cronMetas.forEach((gqlMeta) => {
        const lock = gqlMeta.signalOption.lock;
        const fn = gqlMeta.descriptor.value as (...args: any[]) => Promise<void>;
        const cronTime = gqlMeta.signalOption.scheduleCron;
        if (!cronTime) throw new Error(`Cron time is not found for ${gqlMeta.key}`);
        const cronJob = CronJob.from({
          cronTime,
          onTick: async () => {
            if (lock) {
              if (this.#lockMap.get(fn)) {
                this.logger.warn(`${gqlMeta.key} is locked, skipping...`);
                return;
              }
              this.#lockMap.set(fn, true);
            }
            const before = Date.now();
            this.logger.verbose(`Cron Before ${gqlMeta.key} / ${before}`);
            await fn.apply(this);
            const after = Date.now();
            this.logger.verbose(`Cron After ${gqlMeta.key} / ${after} (${after - before}ms)`);
            if (lock) this.#lockMap.set(fn, false);
          },
          start: true,
        });
        this.#cronMap.set(fn, cronJob);
      });
    }

    async onModuleDestroy() {
      this.#timeoutMap.forEach((timer, fn) => {
        clearTimeout(timer);
        this.#timeoutMap.delete(fn);
      });
      this.#intervalMap.forEach((timer, fn) => {
        clearInterval(timer);
        this.#intervalMap.delete(fn);
      });
      await Promise.all(
        [...this.#cronMap.entries()].map(async ([fn, cronJob]) => {
          await cronJob.stop();
          this.#cronMap.delete(fn);
        })
      );
      await Promise.all(
        destroyMetas.map(async (gqlMeta) => {
          const fn = gqlMeta.descriptor.value as (...args: any[]) => Promise<void>;
          const before = Date.now();
          this.logger.verbose(`Destroy Before ${gqlMeta.key} / ${before}`);
          await fn.apply(this);
          const after = Date.now();
          this.logger.verbose(`Destroy After ${gqlMeta.key} / ${after} (${after - before}ms)`);
        })
      );
    }
  }
  srvRefs.forEach((srvRef) => {
    const serviceMeta = getServiceMeta(srvRef);
    if (!serviceMeta) throw new Error(`Service ${srvRef.name} is not found`);
    Inject(srvRef)(Schedule.prototype, lowerlize(serviceMeta.name));
  });

  @Global()
  @Module({ providers: [Schedule] })
  class ScheduleModule {}
  return ScheduleModule;
};
