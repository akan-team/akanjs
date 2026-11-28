// The desktop update reports (reports.ts) against a scripted receiver: what is kept, what a request carries, and what
// each answer does to the batch, as vectors/updates.json `reports` says for the phones' shells.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { UPDATE_REPORT_BATCH, UPDATE_REPORT_LIMIT, type UpdateReportBody } from "../../../packages/core/src/kernel.ts";
import { claimedRelease, createUpdateReports, osLabel } from "../src/reports.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  retryAfter?: string;
}

function setup({ url = "https://reports.example.com/r/", dev = false, dir = "" } = {}) {
  const folder = dir || mkdtempSync(join(tmpdir(), "akan-native-reports-"));
  if (!dir) dirs.push(folder);
  const posts: { url: string; body: UpdateReportBody; headers: Headers }[] = [];
  const answers: Answer[] = [];
  const clock = { now: 1_800_000_000 };
  let channel = "main";
  const reports = createUpdateReports({
    url,
    platform: "linux",
    now: () => clock.now,
    retryInterval: 3_600_000,
    fetch: (async (input: string, init: RequestInit) => {
      posts.push({ url: input, body: JSON.parse(init.body as string), headers: new Headers(init.headers) });
      const answer = answers.shift() ?? { status: 204 };
      if (answer.status === 0) throw new TypeError("fetch failed");
      return new Response(null, {
        status: answer.status,
        headers: answer.retryAfter ? { "Retry-After": answer.retryAfter } : {},
      });
    }) as unknown as typeof fetch,
  });
  const start = () =>
    reports.start({
      dir: folder,
      dev,
      appVersion: "1.2.0",
      config: () => ({ app: "dev.test.reports", platform: "linux", channel, nativeApi: "0123456789abcdef" }),
    });
  const stored = () =>
    JSON.parse(readFileSync(join(folder, "report.json"), "utf8")) as {
      installId: string;
      nextId: number;
      events: { id: number; bundle: string }[];
      retryAt?: number;
      seen: string[];
    };
  const settled = async () => {
    for (let i = 0; i < 20; i++) await Bun.sleep(0);
    await reports.flush();
  };
  return {
    reports,
    start,
    posts,
    answers,
    clock,
    stored,
    settled,
    folder,
    setChannel: (next: string) => (channel = next),
  };
}

const release = (n: number) => ({ bundle: `${2000 + n}-abcdef12`, sequence: 2000 + n, keyId: "0011223344556677" });

describe("desktop update reports", () => {
  test("an event is posted with the app, its CPU and OS, and leaves the file once the receiver took it", async () => {
    const { reports, start, posts, stored, settled } = setup();
    start();
    reports.record("downloaded", release(0));
    await settled();
    expect(posts).toHaveLength(1);
    const [{ url, body, headers }] = posts as [(typeof posts)[number]];
    expect(url).toBe("https://reports.example.com/r/");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBeNull();
    expect(body).toEqual({
      app: "dev.test.reports",
      platform: "linux",
      channel: "main",
      installId: stored().installId,
      nativeApi: "0123456789abcdef",
      appVersion: "1.2.0",
      os: osLabel("linux"),
      arch: process.arch,
      events: [
        {
          id: 0,
          event: "downloaded",
          bundle: "2000-abcdef12",
          sequence: 2000,
          reason: null,
          at: "2027-01-15T08:00:00.000Z",
          keyId: "0011223344556677",
        },
      ],
    });
    expect(body.installId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.os).toMatch(/^Linux \S/);
    expect(stored()).toMatchObject({ nextId: 1, events: [], seen: ["downloaded|2000-abcdef12|"] });
  });

  test("an event is kept once per release and reason, and a release without a bundle id not at all", async () => {
    const { reports, start, posts, settled } = setup();
    start();
    reports.record("failed", release(0), "signer");
    reports.record("failed", release(0), "signer");
    reports.record("failed", release(0), "server");
    reports.record("failed", {}, "manifest");
    reports.record("failed", { bundle: ".hidden", sequence: 1 }, "manifest");
    reports.record("failed", { bundle: "2001-abcdef12", sequence: "soon", keyId: "not a key id" }, "manifest");
    await settled();
    const events = posts.flatMap((post) => post.body.events);
    expect(events.map(({ id, bundle, reason, sequence }) => [id, bundle, reason, sequence])).toEqual([
      [0, "2000-abcdef12", "signer", 2000],
      [1, "2000-abcdef12", "server", 2000],
      [2, "2001-abcdef12", "manifest", null],
    ]);
    expect(events[2]).not.toHaveProperty("keyId");
  });

  test("a download the page called off is not a failure, and any other error is", async () => {
    const { reports, start, posts, settled } = setup();
    start();
    reports.failed(new AkanNativeError("CANCELLED", "the channel changed during the download"), release(0), "disk");
    reports.failed(new DOMException("The operation was aborted.", "AbortError"), release(0), "download");
    reports.failed(new AkanNativeError("INTERNAL", "no release named yet"), undefined, "manifest");
    reports.failed(new AkanNativeError("NOT_FOUND", "the archive is gone"), release(0), "download");
    await settled();
    expect(posts.flatMap((post) => post.body.events).map((event) => event.reason)).toEqual(["download"]);
  });

  test("batches go oldest first, one request at a time, and only the newest events are kept", async () => {
    const { reports, start, posts, answers, stored, settled } = setup();
    answers.push({ status: 503 });
    start();
    for (let n = 0; n < UPDATE_REPORT_LIMIT + 5; n++) reports.record("downloaded", release(n));
    expect(stored().events).toHaveLength(UPDATE_REPORT_LIMIT);
    expect(stored().events[0]?.id).toBe(5);
    await settled();
    expect(posts[0]?.body.events.map((event) => event.id)).toEqual([0]);
    expect(posts.slice(1).map((post) => post.body.events.length)).toEqual(
      Array.from({ length: UPDATE_REPORT_LIMIT / UPDATE_REPORT_BATCH }, () => UPDATE_REPORT_BATCH),
    );
    expect(posts[1]?.body.events[0]?.id).toBe(5);
    expect(posts.at(-1)?.body.events.at(-1)?.id).toBe(UPDATE_REPORT_LIMIT + 4);
    expect(stored().events).toEqual([]);
  });

  test("a refused batch is dropped, an unanswered one waits, and Retry-After holds the next", async () => {
    const { reports, start, posts, answers, clock, stored, settled } = setup();
    start();
    answers.push({ status: 422 });
    reports.record("downloaded", release(0));
    await settled();
    expect(stored().events).toEqual([]);

    answers.push({ status: 0 }, { status: 429, retryAfter: "120" });
    reports.record("applied", release(0));
    await settled();
    expect(posts).toHaveLength(3);
    expect(stored()).toMatchObject({ events: [{ id: 1 }], retryAt: clock.now + 120 });
    await settled();
    expect(posts).toHaveLength(3);
    clock.now += 121;
    await settled();
    expect(posts).toHaveLength(4);
    expect(stored().events).toEqual([]);
    expect(stored().retryAt).toBeUndefined();
  });

  test("the installId and the id counter outlast a restart, and a second copy of the app shares them", async () => {
    const first = setup();
    first.answers.push({ status: 500 });
    first.start();
    first.reports.record("downloaded", release(0));
    await first.settled();
    const second = setup({ dir: first.folder });
    second.setChannel("pilot");
    second.start();
    second.reports.record("applied", release(0));
    first.reports.record("confirmed", release(0));
    await second.settled();
    await first.settled();
    const sent = [...first.posts, ...second.posts].flatMap((post) => post.body.events.map((event) => event.id));
    expect([...new Set(sent)].sort()).toEqual([0, 1, 2]);
    expect(new Set([...first.posts, ...second.posts].map((post) => post.body.installId)).size).toBe(1);
    expect(second.posts[0]?.body.channel).toBe("pilot");

    writeFileSync(join(first.folder, "report.json"), JSON.stringify({ installId: "short", nextId: 9, events: [] }));
    const third = setup({ dir: first.folder });
    third.start();
    third.reports.record("downloaded", release(1));
    await third.settled();
    expect(third.posts[0]?.body.installId).not.toBe(first.posts[0]?.body.installId);
    expect(third.posts[0]?.body.events[0]?.id).toBe(0);
  });

  test("a release build posts nothing in cleartext but to this machine, and nothing without an address", async () => {
    for (const [url, dev, posted] of [
      ["http://reports.example.com/r", false, false],
      ["http://reports.example.com/r", true, true],
      ["http://127.0.0.1:8791/r", false, true],
      ["http://localhost:8791/r", false, true],
      ["https://reports.example.com/r", false, true],
      ["", false, false],
    ] as const) {
      const { reports, start, posts, settled } = setup({ url, dev });
      start();
      reports.record("downloaded", release(0));
      await settled();
      expect([url, dev, posts.length]).toEqual([url, dev, posted ? 1 : 0]);
    }
  });

  test("a refused envelope's release is read from what it claims, and an unreadable one names none", () => {
    const manifest = Buffer.from(JSON.stringify({ bundle: "2000-abcdef12", sequence: 2000, app: "x" })).toString(
      "base64",
    );
    expect(claimedRelease(manifest, "0011223344556677")).toEqual({
      bundle: "2000-abcdef12",
      sequence: 2000,
      keyId: "0011223344556677",
    });
    expect(claimedRelease(Buffer.from("null").toString("base64"), "0011223344556677")).toEqual({
      bundle: undefined,
      sequence: undefined,
      keyId: "0011223344556677",
    });
    expect(claimedRelease("not base64 JSON", "0011223344556677")).toEqual({});
  });

  test("the OS is named in at most 64 printable ASCII characters", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const label = osLabel(platform);
      expect(label).toMatch(/^(macOS|Windows|Linux) [\x21-\x7e][\x20-\x7e]*$/);
      expect(label.length).toBeLessThanOrEqual(64);
    }
  });
});
