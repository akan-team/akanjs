import { describe, expect, test } from "bun:test";
import { RscPrefetchCache } from "./rscPrefetchCache";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const harness = (
  options: { ttlMs?: number; freshMs?: number; maxConcurrent?: number; maxEntries?: number; maxQueued?: number } = {},
) => {
  let clock = 0;
  const requests: { href: string; signal: AbortSignal; finish: (body?: string | null, status?: number) => void }[] = [];
  const cache = new RscPrefetchCache({
    ...options,
    now: () => clock,
    fetchResponse: (href, signal) =>
      new Promise<Response>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        requests.push({
          href,
          signal,
          finish: (body = `page ${href}`, status = 200) => resolve(new Response(body, { status })),
        });
      }),
  });
  return {
    cache,
    requests,
    hrefs: () => requests.map((request) => request.href),
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

describe("RscPrefetchCache", () => {
  test("hands a prefetched page to the navigation once, with its whole body", async () => {
    const { cache, requests } = harness();
    cache.request("/a", "acct");
    requests[0]?.finish("payload of a");
    await sleep(0);

    const response = await cache.take("/a", "acct")?.response;

    expect(await response?.text()).toBe("payload of a");
    expect(cache.take("/a", "acct")).toBeNull();
  });

  test("hands over a prefetch still loading, which the navigation then waits on", async () => {
    const { cache, requests } = harness();
    cache.request("/a", "acct");
    const taken = cache.take("/a", "acct");
    requests[0]?.finish("late payload");

    expect(await (await taken?.response)?.text()).toBe("late payload");
  });

  test("never serves a page prefetched for another account", async () => {
    const { cache, requests } = harness();
    cache.request("/inbox", "owner");
    requests[0]?.finish();
    await sleep(0);

    expect(cache.take("/inbox", "guest")).toBeNull();
    expect(cache.take("/inbox", "owner")).toBeNull();
  });

  test("drops a page older than its TTL", async () => {
    const { cache, requests, advance } = harness({ ttlMs: 1000 });
    cache.request("/a", "acct");
    requests[0]?.finish();
    await sleep(0);
    advance(1001);

    expect(cache.take("/a", "acct")).toBeNull();
  });

  test("asks again for a page whose prefetch has expired, and not for a fresh one", async () => {
    const { cache, requests, hrefs, advance } = harness({ ttlMs: 1000 });
    cache.request("/a", "acct");
    requests[0]?.finish();
    await sleep(0);
    cache.request("/a", "acct");
    expect(hrefs()).toEqual(["/a"]);

    advance(1001);
    cache.request("/a", "acct");

    expect(hrefs()).toEqual(["/a", "/a"]);
  });

  test("runs at most its cap at once and starts a queued one when a slot frees", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 2 });
    cache.request("/a", "acct");
    cache.request("/b", "acct");
    cache.request("/c", "acct");
    expect(hrefs()).toEqual(["/a", "/b"]);
    expect(cache.queuedCount).toBe(1);

    requests[0]?.finish();
    await sleep(0);

    expect(hrefs()).toEqual(["/a", "/b", "/c"]);
  });

  test("keeps a slot until the body is read to its end", async () => {
    let close = () => {};
    const streaming = new RscPrefetchCache({
      maxConcurrent: 1,
      fetchResponse: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("shell"));
              close = () => controller.close();
            },
          }),
        ),
    });
    streaming.request("/slow", "acct");
    await sleep(0);
    expect(streaming.activeCount).toBe(1);

    close();
    await sleep(0);

    expect(streaming.activeCount).toBe(0);
  });

  test("forgets the oldest queued page past its queue length", () => {
    const { cache, hrefs } = harness({ maxConcurrent: 1, maxQueued: 2 });
    for (const href of ["/a", "/b", "/c", "/d"]) cache.request(href, "acct");

    cache.take("/a", "acct");

    expect(hrefs()).toEqual(["/a"]);
    expect(cache.queuedCount).toBe(2);
  });

  test("drops a refusal or a server error, either of which may be gone by the click", async () => {
    const { cache, requests } = harness({ maxConcurrent: 3 });
    const answers = ["/busy", "/slow", "/down"].map((href) => {
      cache.request(href, "acct");
      return cache.take(href, "acct")?.response;
    });
    requests[0]?.finish("Too Many Requests", 429);
    requests[1]?.finish("Request Timeout", 408);
    requests[2]?.finish("boom", 503);

    expect(await Promise.all(answers)).toEqual([null, null, null]);
  });

  test("keeps a page that opts out of prefetching as nothing, and asks it again only past the TTL", async () => {
    const { cache, requests, hrefs, advance } = harness({ ttlMs: 1000 });
    cache.request("/counted", "acct");
    requests[0]?.finish(null, 204);
    await sleep(0);

    cache.request("/counted", "acct");
    expect(hrefs()).toEqual(["/counted"]);
    expect(await cache.take("/counted", "acct")?.response).toBeNull();

    cache.request("/counted", "acct");
    requests[1]?.finish(null, 204);
    await sleep(0);
    advance(1001);
    cache.request("/counted", "acct");
    expect(hrefs()).toEqual(["/counted", "/counted", "/counted"]);
  });

  test("keeps a not-found, which the navigation acts on as if it had asked", async () => {
    const { cache, requests } = harness();
    cache.request("/a", "acct");
    requests[0]?.finish("0:null\n", 404);

    expect((await cache.take("/a", "acct")?.response)?.status).toBe(404);
  });

  test("names a prefetch fresh only while it is younger than its fresh window", async () => {
    const { cache, requests, advance } = harness({ freshMs: 1000, ttlMs: 5000 });
    cache.request("/young", "acct");
    cache.request("/old", "acct");
    for (const request of requests) request.finish();
    await sleep(0);

    advance(1000);
    expect(cache.take("/young", "acct")?.fresh).toBe(true);
    advance(1);
    expect(cache.take("/old", "acct")?.fresh).toBe(false);
  });

  test("starts the link last pointed at first, and a link that merely showed after every pointed one", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 1 });
    cache.request("/busy", "acct");
    cache.request("/shown", "acct", "low");
    cache.request("/hovered", "acct");
    cache.request("/focused", "acct");
    cache.request("/hovered", "acct", "low");

    for (let i = 0; i < 4; i += 1) {
      requests[i]?.finish();
      await sleep(0);
    }

    expect(hrefs()).toEqual(["/busy", "/focused", "/hovered", "/shown"]);
  });

  test("keeps the links that came into view first when more show than the queue holds", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 1, maxQueued: 2 });
    cache.request("/busy", "acct");
    for (const href of ["/top", "/middle", "/bottom"]) cache.request(href, "acct", "low");

    for (let i = 0; i < 3; i += 1) {
      requests[i]?.finish();
      await sleep(0);
    }

    expect(hrefs()).toEqual(["/busy", "/top", "/middle"]);
  });

  test("withdraws a link still waiting in the queue, never the same page asked for again since", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 1 });
    cache.request("/busy", "acct");
    const withdrawLeft = cache.request("/left", "acct", "low");
    const withdrawHovered = cache.request("/hovered", "acct", "low");
    cache.request("/hovered", "acct");

    withdrawLeft();
    withdrawHovered();
    requests[0]?.finish();
    await sleep(0);

    expect(hrefs()).toEqual(["/busy", "/hovered"]);
    expect(cache.queuedCount).toBe(0);
  });

  test("keeps a page two links wait on queued until both have withdrawn, each only once", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 1 });
    cache.request("/busy", "acct");
    const withdrawFirst = cache.request("/shared", "acct", "low");
    const withdrawSecond = cache.request("/shared", "acct", "low");
    cache.request("/after", "acct", "low");

    withdrawSecond();
    withdrawSecond();
    expect(cache.queuedCount).toBe(2);
    requests[0]?.finish();
    await sleep(0);
    expect(hrefs()).toEqual(["/busy", "/shared"]);

    const withdrawThird = cache.request("/queued", "acct", "low");
    const withdrawFourth = cache.request("/queued", "acct", "low");
    withdrawThird();
    withdrawFourth();
    withdrawFirst();
    requests[1]?.finish();
    await sleep(0);
    expect(hrefs()).toEqual(["/busy", "/shared", "/after"]);
    expect(cache.queuedCount).toBe(0);
  });

  test("prune forgets what is queued and what has expired, and keeps a page still fresh", async () => {
    const { cache, requests, hrefs, advance } = harness({ ttlMs: 1000, maxConcurrent: 2 });
    cache.request("/old", "acct");
    advance(600);
    cache.request("/new", "acct");
    cache.request("/queued", "acct");
    requests[0]?.finish();
    requests[1]?.finish();
    advance(500);

    cache.prune();
    await sleep(0);

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(cache.has("/new", "acct")).toBe(true);
    expect(cache.queuedCount).toBe(0);
    expect(hrefs()).toEqual(["/old", "/new"]);
  });

  test("aborts a taken prefetch when the navigation that took it is overtaken", async () => {
    const { cache, requests } = harness();
    cache.request("/a", "acct");
    const navigation = new AbortController();
    const taken = cache.take("/a", "acct", navigation.signal);

    navigation.abort();

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(await taken?.response).toBeNull();
  });

  test("clear aborts what is loading and forgets what is queued", async () => {
    const { cache, requests, hrefs } = harness({ maxConcurrent: 1 });
    cache.request("/a", "acct");
    cache.request("/b", "acct");

    cache.clear();
    await sleep(0);

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(hrefs()).toEqual(["/a"]);
    expect(cache.activeCount).toBe(0);
  });

  test("evicts the oldest page past its entry cap", async () => {
    const { cache, requests } = harness({ maxEntries: 2 });
    for (const href of ["/a", "/b", "/c"]) cache.request(href, "acct");
    for (const request of requests) request.finish();
    await sleep(0);

    expect(cache.has("/a", "acct")).toBe(false);
    expect(cache.has("/b", "acct")).toBe(true);
    expect(cache.has("/c", "acct")).toBe(true);
  });
});
