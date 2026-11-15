import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { RscHostGate } from "./rscHostGate";
import { RscHostRequests } from "./rscHostRequests";
import type { RscWorkerProcess } from "./rscWorkerProcess";

interface Sent {
  type: string;
  requestId: string;
  url?: string;
}

const hostOf = (gate: RscHostGate | null) => {
  const sent: Sent[] = [];
  const worker = { status: "ready", proc: { send: (message: Sent) => void sent.push(message) } };
  const requests = new RscHostRequests(worker as unknown as RscWorkerProcess, new Logger("RscHostGateTest"), gate);
  const render = (path: string, signal?: AbortSignal) =>
    requests.render(new Request(`http://localhost/${path}`), { signal }).catch((error: unknown) => error);
  const renders = () => sent.filter((message) => message.type === "render").map((message) => message.url);
  const idOf = (path: string) =>
    sent.find((message) => message.type === "render" && message.url === `http://localhost/${path}`)?.requestId ?? "";
  const end = (path: string) => requests.resolvePending(idOf(path), (pending) => pending.onEnd());
  return { sent, worker, requests, render, renders, idOf, end };
};

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RscHostGate", () => {
  test("is off unless AKAN_RSC_HOST_MAX_CONCURRENCY names a whole number above zero", () => {
    expect(RscHostGate.from({})).toBeNull();
    expect(RscHostGate.from({ AKAN_RSC_HOST_MAX_CONCURRENCY: "0" })).toBeNull();
    expect(RscHostGate.from({ AKAN_RSC_HOST_MAX_CONCURRENCY: "off" })).toBeNull();
    expect(RscHostGate.from({ AKAN_RSC_HOST_MAX_CONCURRENCY: "2.5" })).toBeNull();
    expect(RscHostGate.from({ AKAN_RSC_HOST_MAX_CONCURRENCY: "4" })).toBeInstanceOf(RscHostGate);
  });

  test("with no gate every render is sent in the turn it was asked for", () => {
    const host = hostOf(null);
    for (const path of ["a", "b", "c"]) void host.render(path);

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b", "http://localhost/c"]);
    expect(host.requests.gate).toBeNull();
  });

  test("sends as many renders as the cap and the rest in the order they came, one per render that ended", async () => {
    const host = hostOf(new RscHostGate(2));
    for (const path of ["a", "b", "c", "d"]) void host.render(path);

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b"]);
    host.end("a");
    await turn();
    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b", "http://localhost/c"]);
    host.end("c");
    await turn();
    expect(host.renders().at(-1)).toBe("http://localhost/d");
    expect(host.requests.gate?.counts()).toMatchObject({
      rscHostGateInFlight: 2,
      rscHostGateWaiting: 0,
      rscHostGateAdmitted: 4,
      rscHostGateQueued: 2,
    });
  });

  test("a render whose client left while it waited is never sent, and no cancel goes to the worker for it", async () => {
    const host = hostOf(new RscHostGate(1));
    const client = new AbortController();
    void host.render("a");
    const waiting = host.render("b", client.signal);
    void host.render("c");

    client.abort();
    expect(((await waiting) as Error).name).toBe("AbortError");
    host.end("a");
    await turn();

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/c"]);
    expect(host.sent.filter((message) => message.type === "cancel")).toEqual([]);
    expect(host.requests.pending.size).toBe(1);
  });

  test("a render the client left after it was sent gives its slot back and is cancelled in the worker", async () => {
    const host = hostOf(new RscHostGate(1));
    const client = new AbortController();
    void host.render("a", client.signal);
    void host.render("b");

    client.abort();
    await turn();

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b"]);
    expect(host.sent.filter((message) => message.type === "cancel").map((message) => message.requestId)).toEqual([
      host.idOf("a"),
    ]);
  });

  test("told to let requests without credentials past, it sends those at once and holds the rest", () => {
    const host = hostOf(new RscHostGate(1, "end", { passesPublic: true }));
    const signedIn = (path: string) =>
      void host.requests
        .render(new Request(`http://localhost/${path}`, { headers: { cookie: "session=1" } }), {})
        .catch(() => undefined);
    signedIn("a");
    signedIn("b");
    void host.render("c");

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/c"]);
    expect(host.requests.gate?.counts()).toMatchObject({ rscHostGateWaiting: 1, rscHostGatePassed: 1 });
  });

  test("released on the first message, a slot comes back before its render ends", async () => {
    const host = hostOf(new RscHostGate(1, "first"));
    void host.render("a");
    void host.render("b");

    host.requests.pending.get(host.idOf("a"))?.onMeta?.({});
    await turn();

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b"]);
    expect(host.requests.pending.size).toBe(2);
  });

  test("released on a timer, a slot comes back after that many milliseconds though nothing was answered", async () => {
    const host = hostOf(new RscHostGate(1, 5));
    void host.render("a");
    void host.render("b");

    expect(host.renders()).toEqual(["http://localhost/a"]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b"]);
  });

  test("when the worker exits, the renders it was sent fail and give back their slots to the ones still waiting", async () => {
    const host = hostOf(new RscHostGate(1));
    const gate = host.requests.gate;
    const sentRender = host.render("a");
    void host.render("b");
    void host.render("c");

    host.worker.status = "restarting";
    host.requests.failRequests(
      new AkanError("rscWorkerStopped", "rsc worker exited with code 9"),
      (requestId) => !gate?.isWaiting(requestId),
    );
    expect(AkanError.is(await sentRender, "rscWorkerStopped")).toBe(true);
    await turn();

    expect(host.requests.pending.size).toBe(2);
    expect(host.requests.queuedSends.length).toBe(1);
    host.worker.status = "ready";
    host.requests.flushQueuedSends();
    expect(host.renders()).toEqual(["http://localhost/a", "http://localhost/b"]);
    host.end("b");
    await turn();
    expect(host.renders().at(-1)).toBe("http://localhost/c");
  });
});
