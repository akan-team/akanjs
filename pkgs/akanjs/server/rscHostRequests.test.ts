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
