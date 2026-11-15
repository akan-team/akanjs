import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { ClientManifest } from "./artifact";
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

describe("RscHostRequests render manifest", () => {
  interface SentRender {
    type: string;
    manifestRevision?: number;
    clientManifest?: ClientManifest;
  }
  const manifestOf = (id: string): ClientManifest => ({ "ui/Widget.tsx#Widget": { id, chunks: [], name: "Widget" } });
  const procOf = (sent: SentRender[]) => ({ send: (message: SentRender) => void sent.push(message) });
  const hostOf = (status: string, proc: { send: (message: SentRender) => void }) => {
    const worker = { status, proc };
    const requests = new RscHostRequests(worker as unknown as RscWorkerProcess, new Logger("RscHostRequestsTest"));
    const render = (clientManifest?: ClientManifest) =>
      void requests.render(new Request("http://localhost/x"), { clientManifest }).catch(() => undefined);
    return { worker, requests, render };
  };
  const manifestsOf = (sent: SentRender[]) =>
    sent.map(({ manifestRevision, clientManifest }) => [manifestRevision, clientManifest]);

  test("sends a manifest with the first render that uses it, and only its revision with the renders after", () => {
    const sent: SentRender[] = [];
    const { render } = hostOf("ready", procOf(sent));
    const first = manifestOf("/a.js");
    const second = manifestOf("/b.js");

    render(first);
    render(first);
    render(second);
    render(second);
    render(first);
    render();

    expect(manifestsOf(sent)).toEqual([
      [1, first],
      [1, undefined],
      [2, second],
      [2, undefined],
      [3, first],
      [undefined, undefined],
    ]);
  });

  test("sends the manifest again to the process that replaced the worker, a render queued for it included", () => {
    const toFirst: SentRender[] = [];
    const toSecond: SentRender[] = [];
    const { worker, requests, render } = hostOf("ready", procOf(toFirst));
    const manifest = manifestOf("/a.js");
    render(manifest);
    render(manifest);

    worker.status = "restarting";
    render(manifest);
    worker.proc = procOf(toSecond);
    worker.status = "ready";
    requests.flushQueuedSends();
    render(manifest);

    expect(manifestsOf(toFirst)).toEqual([
      [1, manifest],
      [1, undefined],
    ]);
    expect(manifestsOf(toSecond)).toEqual([
      [2, manifest],
      [2, undefined],
    ]);
  });

  test("names the manifest by revision again to the process a failed replacement hands the worker back to", () => {
    const toFirst: SentRender[] = [];
    const toReplacement: SentRender[] = [];
    const first = procOf(toFirst);
    const { worker, requests, render } = hostOf("ready", first);
    const manifest = manifestOf("/a.js");
    const newer = manifestOf("/b.js");
    render(manifest);

    worker.status = "restarting";
    worker.proc = procOf(toReplacement);
    render(manifest);
    render(newer);
    worker.proc = first;
    worker.status = "ready";
    requests.flushQueuedSends();
    render(newer);

    expect(toReplacement).toEqual([]);
    expect(manifestsOf(toFirst)).toEqual([
      [1, manifest],
      [1, undefined],
      [2, newer],
      [2, undefined],
    ]);
  });

  test("sends the manifest again once the worker has answered that it does not hold it", () => {
    const sent: SentRender[] = [];
    const { requests, render } = hostOf("ready", procOf(sent));
    const manifest = manifestOf("/a.js");
    render(manifest);
    render(manifest);

    requests.forgetManifest();
    render(manifest);
    render(manifest);

    expect(manifestsOf(sent)).toEqual([
      [1, manifest],
      [1, undefined],
      [1, manifest],
      [1, undefined],
    ]);
  });

  test("sends the manifest again after a send that failed", () => {
    const sent: SentRender[] = [];
    const channel: { closed: boolean } = { closed: true };
    const { render } = hostOf("ready", {
      send: (message) => {
        if (channel.closed) throw new Error("channel closed");
        sent.push(message);
      },
    });
    const manifest = manifestOf("/a.js");

    render(manifest);
    channel.closed = false;
    render(manifest);
    render(manifest);

    expect(manifestsOf(sent)).toEqual([
      [1, manifest],
      [1, undefined],
    ]);
  });
});
