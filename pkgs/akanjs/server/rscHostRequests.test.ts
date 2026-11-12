import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { RscHostRequests } from "./rscHostRequests";
import type { RscWorkerProcess } from "./rscWorkerProcess";

const requestsTo = (worker: { status: string; proc: { send: () => void } }) =>
  new RscHostRequests(worker as unknown as RscWorkerProcess, new Logger("RscHostRequestsTest"));

describe("RscHostRequests calls", () => {
  test("fails a call to a stopped worker, and one whose send throws, as rscWorkerStopped", async () => {
    const stopped = await requestsTo({ status: "stopped", proc: { send: () => undefined } })
      .call(() => ({ type: "page-prompts" }))
      .catch((error: unknown) => error);
    const unsent = await requestsTo({
      status: "ready",
      proc: {
        send: () => {
          throw new Error("channel closed");
        },
      },
    })
      .call(() => ({ type: "page-prompts" }))
      .catch((error: unknown) => error);

    expect(AkanError.is(stopped, "rscWorkerStopped")).toBe(true);
    expect(stopped).toMatchObject({ statusCode: 500, message: "rsc worker is stopped" });
    expect(AkanError.is(unsent, "rscWorkerStopped")).toBe(true);
    expect(unsent).toMatchObject({ statusCode: 500, message: "rsc worker send failed: channel closed" });
  });
});

describe("RscHostRequests renders", () => {
  const render = (requests: RscHostRequests) =>
    requests.render(new Request("http://localhost/x"), {}).catch((error: unknown) => error);

  test("fails a render to a stopped worker, one whose send throws, and one in flight when it exits as rscWorkerStopped", async () => {
    const stopped = await render(requestsTo({ status: "stopped", proc: { send: () => undefined } }));
    const unsent = await render(
      requestsTo({
        status: "ready",
        proc: {
          send: () => {
            throw new Error("channel closed");
          },
        },
      }),
    );
    const live = requestsTo({ status: "ready", proc: { send: () => undefined } });
    const inFlight = render(live);
    live.failRequests(new AkanError("rscWorkerStopped", "rsc worker exited with code 7"));

    expect(AkanError.is(stopped, "rscWorkerStopped")).toBe(true);
    expect(stopped).toMatchObject({ statusCode: 500, message: "rsc worker is stopped" });
    expect(AkanError.is(unsent, "rscWorkerStopped")).toBe(true);
    expect(unsent).toMatchObject({ statusCode: 500, message: "rsc worker send failed: channel closed" });
    const exited = await inFlight;
    expect(AkanError.is(exited, "rscWorkerStopped")).toBe(true);
    expect(exited).toMatchObject({ statusCode: 500, message: "rsc worker exited with code 7" });
  });

  test("fails a render in flight when the worker's boot fails as rscWorkerFailed", async () => {
    const live = requestsTo({ status: "ready", proc: { send: () => undefined } });
    const inFlight = render(live);
    live.failRequests(new AkanError("rscWorkerFailed", "rsc worker exited with code 3 while loading the pages bundle"));

    expect(AkanError.is(await inFlight, "rscWorkerFailed")).toBe(true);
  });
});
