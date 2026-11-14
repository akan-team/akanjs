import { describe, expect, test } from "bun:test";
import { markFailureLogged } from "../../common/loggedFailure";
import { Scheduler } from "./schedule.adaptor";

const createScheduler = () => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const scheduler = new Scheduler();
  Object.assign(scheduler, {
    logger: { warn: (m: string) => warnings.push(m), debug: () => {}, error: (m: string) => errors.push(m) },
  });
  return { scheduler, warnings, errors };
};

describe("Scheduler failures", () => {
  test("writes its own error line only for a failure no request line has logged", async () => {
    const { scheduler, errors } = createScheduler();
    const logged = new Error("told by the request line");
    markFailureLogged(logged);
    scheduler.registerInit("told", async () => Promise.reject(logged));
    scheduler.registerInit("untold", async () => Promise.reject(new Error("nobody said")));
    scheduler.registerDestroy("toldOnDestroy", async () => Promise.reject(logged));
    await scheduler._runInit();
    await scheduler._runDestroy();

    expect(errors).toEqual(["Schedule init untold error: Error: nobody said"]);
  });
});

describe("Scheduler cron", () => {
  test("registers a job, exposes it by key, and reports its expression", () => {
    const { scheduler } = createScheduler();
    const job = scheduler.registerCron("hourly", "0 * * * *", async () => {});

    expect(job.cron).toBe("0 * * * *");
    expect(scheduler.getCron("hourly")).toBe(job);

    scheduler.unregisterCron("hourly");
    expect(scheduler.getCron("hourly")).toBeUndefined();
  });

  test("rejects an invalid expression at registration rather than never firing", () => {
    const { scheduler } = createScheduler();
    expect(() => scheduler.registerCron("bad", "not a cron", async () => {})).toThrow();
    expect(() => scheduler.registerCron("seconds", "*/5 * * * * *", async () => {})).toThrow();
  });

  test("warns that lock:false cannot be honoured", () => {
    const { scheduler, warnings } = createScheduler();
    scheduler.registerCron("loose", "0 * * * *", async () => {}, { lock: false });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("never overlaps");

    scheduler.unregisterCron("loose");
  });

  test("onDestroy stops every registered job", async () => {
    const { scheduler } = createScheduler();
    scheduler.registerCron("a", "0 * * * *", async () => {});
    scheduler.registerCron("b", "@daily", async () => {});
    scheduler.registerInterval("c", 60_000, async () => {});
    scheduler.registerTimeout("d", 60_000, async () => {});

    await scheduler.onDestroy();

    expect(scheduler.cronMap.size).toBe(0);
    expect(scheduler.intervalMap.size).toBe(0);
    expect(scheduler.timeoutMap.size).toBe(0);
    expect(scheduler.lockMap.size).toBe(0);
  });
});
