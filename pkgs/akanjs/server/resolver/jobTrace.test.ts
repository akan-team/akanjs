import { afterEach, describe, expect, test } from "bun:test";
import { Logger, type LogRecord } from "akanjs/common";
import type { AkanJob } from "akanjs/service";
import { RequestTrace } from "../../signal/requestTrace";
import { getCurrentTrace, runTraced, SignalTrace, setCanonicalLineMode } from "../../signal/trace";
import { JobTrace } from "./jobTrace";

const hex32 = /^[0-9a-f]{32}$/;
const jobWith = (traceLink?: string): AkanJob => ({
  id: "job-1",
  name: "sendMail",
  data: [],
  attemptsMade: 1,
  opts: { attempts: 3, ...(traceLink ? { traceLink } : {}) },
});

afterEach(() => setCanonicalLineMode("off"));

describe("JobTrace", () => {
  test("stamps a job enqueued while a call is open with that call's trace id, and leaves any other as it came", async () => {
    const request = RequestTrace.fresh();
    const options = { attempts: 3 };

    const inRequest = RequestTrace.run(request, () => JobTrace.linked(options));
    const inCall = await runTraced(new SignalTrace("checkout", "mutation", { mode: "context" }), async () => ({
      linked: JobTrace.linked(),
      traceId: getCurrentTrace()?.traceId,
    }));

    expect(inRequest).toEqual({ attempts: 3, traceLink: request.traceId });
    expect(options).toEqual({ attempts: 3 });
    expect(inCall.linked).toEqual({ traceLink: inCall.traceId ?? "" });
    expect(JobTrace.linked(options)).toBe(options);
    expect(JobTrace.linked()).toBeUndefined();
  });

  test("runs a job as a trace of its own that names the enqueuing one as its link", async () => {
    setCanonicalLineMode("all");
    const records: LogRecord[] = [];
    const removeSink = Logger.addSink((entry) => void records.push(entry.record));
    const enqueuer = "0af7651916cd43dd8448eb211c80319c";
    const stale = RequestTrace.fresh();
    const seen: (string | undefined)[] = [];
    const run = (job: unknown) => JobTrace.run("sendMail", job, async () => void seen.push(getCurrentTrace()?.traceId));
    try {
      await RequestTrace.run(stale, () => run(jobWith(enqueuer)));
      await run(jobWith());
      await run(jobWith("not an id\nsecond line"));
      await run(undefined);
    } finally {
      removeSink();
    }

    for (const id of seen) expect(id).toMatch(hex32);
    expect(new Set([...seen, enqueuer, stale.traceId]).size).toBe(6);
    expect(records.map((record) => [record.message, record.traceId, record.attrs?.link])).toEqual([
      ["ok internal:sendMail", seen[0] ?? "", enqueuer],
      ["ok internal:sendMail", seen[1] ?? "", undefined],
      ["ok internal:sendMail", seen[2] ?? "", undefined],
      ["ok internal:sendMail", seen[3] ?? "", undefined],
    ]);
  });
});
