import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { INJECT_META } from "akanjs/base";
import type { ServiceModel } from "akanjs/service";
import { internal } from "akanjs/signal";
import { ConformanceEnv } from "../../test/conformance";
import type { InjectInfo } from "../injectInfo";
import { ScheduleAdaptorRole } from "./role.adaptor";
import { Scheduler } from "./schedule.adaptor";

// Two schedulers sharing one cache stand in for two instances of one app. Ids are from
// `local/database-modes/01-multiple-redis.md` §4 and `03-single-instance-assumptions.md` §3; an id on a plain `test` is
// a fixed defect.

const quiet = { debug: () => undefined, warn: () => undefined, error: () => undefined, verbose: () => undefined };

const kinds = ConformanceEnv.cacheKinds("schedule conformance");

for (const kind of kinds) {
  describe(`schedule conformance (${kind} cache)`, () => {
    let shared: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    const instances: Scheduler[] = [];
    const instance = () => {
      const scheduler = new Scheduler();
      Object.assign(scheduler, { cache: shared.cache, logger: quiet });
      instances.push(scheduler);
      return scheduler;
    };
    beforeAll(async () => {
      shared = await ConformanceEnv.openCache(kind);
    });
    afterEach(async () => {
      for (const scheduler of instances.splice(0)) await scheduler.onDestroy();
    });
    afterAll(async () => {
      await shared?.close();
    });

    test("[S-1] a locked interval runs once per period across instances", async () => {
      const key = ConformanceEnv.uniqueName("tick");
      let runs = 0;
      for (const scheduler of [instance(), instance()])
        scheduler.registerInterval(key, 100, async () => {
          runs += 1;
        });
      await Bun.sleep(450);
      expect(runs).toBeGreaterThanOrEqual(3);
      expect(runs).toBeLessThanOrEqual(5);
    });

    test("a locked interval that outlives its period never runs on two instances at once", async () => {
      const key = ConformanceEnv.uniqueName("slow");
      let running = 0;
      let overlap = 0;
      let runs = 0;
      for (const scheduler of [instance(), instance()])
        scheduler.registerInterval(key, 50, async () => {
          running += 1;
          overlap = Math.max(overlap, running);
          await Bun.sleep(160);
          running -= 1;
          runs += 1;
        });
      await Bun.sleep(600);
      expect(overlap).toBe(1);
      expect(runs).toBeGreaterThanOrEqual(2);
    });

    test("[S-1] a cron tick runs on one instance", async () => {
      const ticks: (() => Promise<void>)[] = [];
      const cron = spyOn(Bun, "cron").mockImplementation(((expression: string, callback: () => Promise<void>) => {
        ticks.push(callback);
        return { cron: expression, stop: () => undefined, ref: () => undefined, unref: () => undefined };
      }) as unknown as typeof Bun.cron);
      try {
        const key = ConformanceEnv.uniqueName("hourly");
        let runs = 0;
        for (const scheduler of [instance(), instance(), instance()])
          scheduler.registerCron(key, "0 * * * *", async () => {
            runs += 1;
          });
        await Promise.all(ticks.map(async (tick) => await tick()));
        expect(runs).toBe(1);
      } finally {
        cron.mockRestore();
      }
    });

    test("[S-4] a `once` init runs once when instances boot together, and again on a later boot", async () => {
      const key = ConformanceEnv.uniqueName("initializeAdmin");
      let runs = 0;
      const boot = () => {
        const scheduler = instance();
        scheduler.registerInit(
          key,
          async () => {
            runs += 1;
            await Bun.sleep(100);
          },
          { once: true },
        );
        return scheduler;
      };
      await Promise.all([boot(), boot(), boot()].map(async (scheduler) => await scheduler._runInit()));
      expect(runs).toBe(1);
      await boot()._runInit();
      expect(runs).toBe(2);
    });

    test("an init without `once` runs on every instance", async () => {
      const key = ConformanceEnv.uniqueName("warmCache");
      let runs = 0;
      const schedulers = [instance(), instance()];
      for (const scheduler of schedulers)
        scheduler.registerInit(key, async () => {
          runs += 1;
        });
      await Promise.all(schedulers.map(async (scheduler) => await scheduler._runInit()));
      expect(runs).toBe(2);
    });
  });
}

describe("schedule role", () => {
  test("[S-2] an Internal plugs the schedule role, so an app can replace the scheduler", () => {
    const probeService = { srv: { refName: "scheduleProbe" }, srvMap: {} } as unknown as ServiceModel;
    const ProbeInternal = internal(probeService, () => ({}));
    const injectMap = (ProbeInternal as unknown as { [INJECT_META]: Record<string, InjectInfo> })[INJECT_META];
    expect(injectMap.schedule?.adaptor).toBe(ScheduleAdaptorRole);
  });
});
