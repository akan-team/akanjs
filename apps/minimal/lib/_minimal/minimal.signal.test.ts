import { beforeAll, describe, expect, it } from "bun:test";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as minimalFetch } from "../useServer";

describe("Minimal Signal", () => {
  let fetch: typeof minimalFetch;

  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof minimalFetch>();
  });

  it("hears a room's publish on the test fetch itself, with no clone and no connect call", async () => {
    const heard: unknown[] = [];
    const stop = fetch.subscribeBenchFanout("signal-test-room", (data) => {
      heard.push(data);
    });
    const deadline = Date.now() + 3_000;
    for (let seq = 1; !heard.length && Date.now() < deadline; seq++) {
      fetch.benchPublish("signal-test-room", seq, Date.now());
      await Bun.sleep(50);
    }
    stop();
    expect(heard.length).toBeGreaterThan(0);
  });
});
