import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import { createDesktopNotifications, type NativeRequest, permissionState } from "../src/desktop.ts";
import { localNotifications as ln, type NotificationEvent } from "../src/index.ts";
import { addInterval, nextOccurrence, normalizeSchedule } from "../src/schedule.ts";
import { NotificationTimers } from "../src/timers.ts";
import { resetWebState } from "../src/web.ts";

const NOW = new Date(2026, 8, 25, 10, 0, 0).getTime(); // local time
const rejects = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

describe("normalizeSchedule", () => {
  const one = (n: Record<string, unknown>) =>
    normalizeSchedule({ notifications: [{ id: 1, title: "T", ...n }] }, NOW).notifications[0]!;
  const bad = (args: unknown) => {
    try {
      normalizeSchedule(args, NOW);
    } catch (e) {
      return isAkanNativeError(e, "INVALID_ARGS") ? (e as Error).message : `wrong error ${e}`;
    }
    return "accepted";
  };

  test("resolves the first delivery time", () => {
    expect(one({})).toEqual({ id: 1, title: "T", body: "", at: NOW });
    expect(one({ at: NOW - 5000 }).at).toBe(NOW); // past one-shot: right away
    expect(one({ at: NOW + 1234.4 }).at).toBe(NOW + 1234);
    expect(one({ at: "2026-09-25T10:30:00" }).at).toBe(NOW + 30 * 60_000); // no offset: local time
    expect(one({ at: new Date(NOW + 60_000).toISOString() }).at).toBe(NOW + 60_000);
    // repeats start at most one interval minus REPEAT_MARGIN from now (iOS calendar triggers)
    expect(one({ every: "minute" }).at).toBe(NOW + 58_000);
    expect(one({ every: "day" }).at).toBe(new Date(2026, 8, 26, 9, 59, 58).getTime());
    expect(one({ every: "minute", at: NOW + 59_500 }).at).toBe(NOW + 58_000);
    expect(one({ every: "minute", at: NOW - 500 }).at).toBe(NOW + 58_000);
    // at sets the phase of the repeats; a past at continues at its next occurrence
    expect(one({ every: "hour", at: NOW + 20 * 60_000 }).at).toBe(NOW + 20 * 60_000);
    expect(one({ every: "hour", at: NOW - 50 * 60_000 }).at).toBe(NOW + 10 * 60_000);
    expect(one({ every: "day", at: new Date(2026, 8, 20, 9, 0, 0).getTime() }).at).toBe(
      new Date(2026, 8, 26, 9, 0, 0).getTime(),
    );
  });

  test("keeps body, every, channelId and a copy of data", () => {
    const data = { a: [1, null, "x"], b: { c: true } };
    const n = one({ body: "B", every: "week", at: NOW + 1000, channelId: "alerts", data });
    expect(n).toEqual({ id: 1, title: "T", body: "B", at: NOW + 1000, every: "week", channelId: "alerts", data });
    expect(n.data).not.toBe(data);
  });

  test("rejects bad arguments with INVALID_ARGS", () => {
    expect(bad(undefined)).toContain("non-empty array");
    expect(bad({ notifications: [] })).toContain("non-empty array");
    expect(bad({ notifications: [null] })).toContain("must be an object");
    for (const id of [1.5, "1", 2 ** 31, NaN])
      expect(bad({ notifications: [{ id, title: "T" }] })).toContain("32-bit integer");
    expect(
      bad({
        notifications: [
          { id: 1, title: "T" },
          { id: 1, title: "U" },
        ],
      }),
    ).toContain("used twice");
    expect(bad({ notifications: [{ id: 1, title: " " }] })).toContain("title");
    expect(bad({ notifications: [{ id: 1, title: "T", body: 3 }] })).toContain("body");
    expect(bad({ notifications: [{ id: 1, title: "T", at: "soon" }] })).toContain("ISO 8601");
    expect(bad({ notifications: [{ id: 1, title: "T", at: Infinity }] })).toContain("ISO 8601");
    expect(bad({ notifications: [{ id: 1, title: "T", every: "month" }] })).toContain("every");
    expect(bad({ notifications: [{ id: 1, title: "T", every: "minute", at: NOW + 61_000 }] })).toContain(
      "less than one minute",
    );
    expect(bad({ notifications: [{ id: 1, title: "T", channelId: "" }] })).toContain("channelId");
    expect(bad({ notifications: [{ id: 1, title: "T", data: [1] }] })).toContain("plain JSON object");
    expect(bad({ notifications: [{ id: 1, title: "T", data: new Date() }] })).toContain("plain JSON object");
  });
});

describe("time arithmetic", () => {
  test("day and week keep the local time across DST; minute and hour are fixed", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const before = new Date(2026, 2, 7, 9, 0, 0).getTime(); // Saturday before the spring-forward night
      const next = addInterval(before, "day");
      expect(new Date(next).getHours()).toBe(9);
      expect(next - before).toBe(23 * 3_600_000);
      expect(new Date(addInterval(before, "week")).getHours()).toBe(9);
      expect(addInterval(before, "hour", 30) - before).toBe(30 * 3_600_000);
      // the series stays at 09:00 on both sides of the change
      expect(new Date(nextOccurrence(before, "day", before + 40 * 86_400_000)).getHours()).toBe(9);
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });

  test("nextOccurrence is the first occurrence strictly after the given time", () => {
    expect(nextOccurrence(NOW + 5, "minute", NOW)).toBe(NOW + 5);
    expect(nextOccurrence(NOW, "minute", NOW)).toBe(NOW + 60_000);
    expect(nextOccurrence(NOW - 1, "minute", NOW)).toBe(NOW + 59_999);
    expect(nextOccurrence(NOW - 3 * 604_800_000, "week", NOW)).toBe(NOW + 604_800_000);
    expect(nextOccurrence(NOW - 86_400_000 * 1000, "day", NOW + 1)).toBe(NOW + 86_400_000);
  });
});

describe("NotificationTimers", () => {
  function fake() {
    let now = NOW;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const shown: number[] = [];
    const t = new NotificationTimers({
      now: () => now,
      setTimer: (fn, ms) => {
        const id = nextId++;
        timers.push({ at: now + ms, fn, id });
        return id;
      },
      clearTimer: (id) => timers.splice(timers.findIndex((x) => x.id === id) >>> 0, 1),
      show: (n) => shown.push(n.id),
    });
    const advance = (ms: number) => {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > end) break;
        timers.shift();
        now = due.at;
        due.fn();
      }
      now = end;
    };
    return { t, shown, advance, timers };
  }

  test("shows due ones now, later ones on time, repeats until cancelled", () => {
    const { t, shown, advance } = fake();
    expect(
      t.schedule([
        { id: 1, title: "now", body: "", at: NOW },
        { id: 2, title: "later", body: "", at: NOW + 1000 },
        { id: 3, title: "repeat", body: "", at: NOW + 60_000, every: "minute" },
      ]),
    ).toEqual([1, 2, 3]);
    expect(shown).toEqual([1]);
    expect(t.list().map((n) => n.id)).toEqual([2, 3]);
    advance(1000);
    expect(shown).toEqual([1, 2]);
    advance(180_000);
    expect(shown).toEqual([1, 2, 3, 3, 3]);
    expect(t.list()).toMatchObject([{ id: 3, at: NOW + 1000 + 180_000 + 59_000 }]);
    t.cancel([3]);
    advance(600_000);
    expect(shown).toEqual([1, 2, 3, 3, 3]);
    expect(t.list()).toEqual([]);
  });

  test("the same id replaces; waits longer than setTimeout allows go in steps", () => {
    const { t, shown, advance } = fake();
    t.schedule([{ id: 1, title: "a", body: "", at: NOW + 1000 }]);
    t.schedule([{ id: 1, title: "b", body: "", at: NOW + 40 * 86_400_000 }]);
    advance(1000);
    expect(shown).toEqual([]);
    advance(39 * 86_400_000);
    expect(shown).toEqual([]);
    advance(86_400_000);
    expect(shown).toEqual([1]);
  });
});

describe("native hosts", () => {
  const methods = (log: unknown[]) => ({
    schedule: (args: { notifications: { id: number }[] }) => {
      log.push(args);
      return { ids: args.notifications.map((n) => n.id) };
    },
    cancel: (args: unknown) => void log.push(args),
    getPending: () => ({ notifications: [] }),
    checkPermission: () => ({ display: "prompt-with-rationale" }),
  });

  test("schedule sends resolved epoch ms; bad arguments never reach the host", async () => {
    const log: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: { "local-notifications": { methods: methods(log), events: ["received", "action"] } },
    });
    const before = Date.now();
    expect(
      await ln.schedule({
        notifications: [
          { id: 7, title: "T", at: "2030-01-01T00:00:00Z", data: { x: 1 } },
          { id: 8, title: "Now" },
        ],
      }),
    ).toEqual({ ids: [7, 8] });
    const sent = (log[0] as { notifications: Record<string, unknown>[] }).notifications;
    expect(sent[0]).toEqual({ id: 7, title: "T", body: "", at: Date.UTC(2030, 0, 1), data: { x: 1 } });
    expect(sent[1]!.at as number).toBeGreaterThanOrEqual(before);

    const requests = host.requests.length;
    expect(
      isAkanNativeError(await rejects(ln.schedule({ notifications: [{ id: 1, title: "" }] })), "INVALID_ARGS"),
    ).toBe(true);
    expect(isAkanNativeError(await rejects(ln.cancel({ ids: [1.5] })), "INVALID_ARGS")).toBe(true);
    expect(isAkanNativeError(await rejects(ln.removeDelivered({} as never)), "INVALID_ARGS")).toBe(true);
    expect(host.requests.length).toBe(requests);

    await ln.cancel({ ids: [7] });
    expect(log[1]).toEqual({ ids: [7] });
    expect(await ln.checkPermission()).toEqual({ display: "prompt-with-rationale" });
  });

  test("events come from the host", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: { "local-notifications": { methods: methods([]), events: ["received", "action"] } },
    });
    const seen: NotificationEvent[] = [];
    const stop = ln.listen("action", (e) => seen.push(e));
    await tick();
    expect(host.subscriptions("local-notifications", "action")).toBe(1);
    host.emit("local-notifications", "action", { id: 3, title: "T", body: "", data: { k: 1 } });
    expect(seen).toEqual([{ id: 3, title: "T", body: "", data: { k: 1 } }]);
    stop();
  });

  test("a host without the plugin rejects UNSUPPORTED (after the argument check)", async () => {
    host = installMockHost({ platform: "ios", plugins: {} });
    expect(
      isAkanNativeError(await rejects(ln.schedule({ notifications: [{ id: 1, title: "T" }] })), "UNSUPPORTED"),
    ).toBe(true);
    expect(isAkanNativeError(await rejects(ln.schedule({ notifications: [] })), "INVALID_ARGS")).toBe(true);
    expect(ln.isSupported("getPending")).toBe(false);
  });
});

describe("web", () => {
  class FakeNotification {
    static permission: NotificationPermission = "default";
    static instances: FakeNotification[] = [];
    static requestPermission(cb?: (p: NotificationPermission) => void) {
      FakeNotification.permission = "granted";
      cb?.("granted");
      return Promise.resolve(FakeNotification.permission);
    }
    onclick: (() => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    constructor(
      readonly title: string,
      readonly options: NotificationOptions,
    ) {
      FakeNotification.instances.push(this);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.onclose?.();
    }
  }
  const g = globalThis as { Notification?: unknown; window?: unknown };

  beforeEach(() => {
    FakeNotification.permission = "default";
    FakeNotification.instances = [];
    g.window = globalThis;
    host = installMockHost({ platform: "web" });
  });
  afterEach(() => {
    resetWebState();
    delete g.Notification;
    delete g.window;
  });

  test("UNSUPPORTED without the Notification API", async () => {
    expect(ln.implementation("schedule")).toBe("web");
    expect(isAkanNativeError(await rejects(ln.checkPermission()), "UNSUPPORTED")).toBe(true);
    expect(
      isAkanNativeError(await rejects(ln.schedule({ notifications: [{ id: 1, title: "T" }] })), "UNSUPPORTED"),
    ).toBe(true);
  });

  test("permission, then show, list, tap (buffered until listened) and close", async () => {
    g.Notification = FakeNotification;
    expect(await ln.checkPermission()).toEqual({ display: "prompt" });
    expect(
      isAkanNativeError(await rejects(ln.schedule({ notifications: [{ id: 1, title: "T" }] })), "PERMISSION_DENIED"),
    ).toBe(true);
    expect(await ln.requestPermission()).toEqual({ display: "granted" });

    const received: NotificationEvent[] = [];
    const stopReceived = ln.listen("received", (e) => received.push(e));
    await ln.schedule({
      notifications: [
        { id: 1, title: "Now", body: "b", data: { k: 1 } },
        { id: 2, title: "Soon", at: Date.now() + 30 },
      ],
    });
    expect(FakeNotification.instances.map((n) => [n.title, n.options.tag])).toEqual([["Now", "akan-native-1"]]);
    expect((await ln.getPending()).notifications.map((n) => n.id)).toEqual([2]);
    await tick(60);
    expect(FakeNotification.instances.map((n) => n.title)).toEqual(["Now", "Soon"]);
    expect(received.map((e) => e.id)).toEqual([1, 2]);
    expect((await ln.getDelivered()).notifications.map((n) => n.id)).toEqual([1, 2]);

    FakeNotification.instances[0]!.onclick!(); // no "action" listener yet
    const actions: NotificationEvent[] = [];
    const stopAction = ln.listen("action", (e) => actions.push(e));
    expect(actions).toEqual([{ id: 1, title: "Now", body: "b", data: { k: 1 } }]);
    expect((await ln.getDelivered()).notifications.map((n) => n.id)).toEqual([2]);
    await ln.removeAllDelivered();
    expect((await ln.getDelivered()).notifications).toEqual([]);
    stopReceived();
    stopAction();
  });
});

describe("desktop implementation (the shell's notify.* ops)", () => {
  /** What every op carries besides its own arguments (Windows and Linux use it). */
  const app = { id: "dev.test", name: "Test" };
  /** A fake notify.rs: an in-memory center. */
  function setup(initialStatus = 2) {
    const ops: { op: string; args?: Record<string, unknown> }[] = [];
    const emitted: { event: string; data: unknown }[] = [];
    let status = initialStatus;
    const pending = new Map<string, NativeRequest>();
    const delivered = new Map<string, NativeRequest>();
    const native = new Map<string, (e: NativeEvent) => void>();
    const plugin = createDesktopNotifications();
    const dispatcher = createDispatcher([plugin], {
      app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-ln-")), "data"),
      emit: (_window, { event, data }) => emitted.push({ event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      onNativeEvent: (type, listener) => {
        native.set(type, listener);
        return () => native.delete(type);
      },
      shell: async (op, args) => {
        const { window: _window, ...rest } = args ?? {}; // the dispatcher adds the calling window
        ops.push({ op, args: rest });
        switch (op) {
          case "notify.status":
            return { status };
          case "notify.request":
            status = args?.provisional ? 3 : 2;
            return { status };
          case "notify.add":
            for (const item of args!.items as {
              id: number;
              title: string;
              body: string;
              at: number;
              every?: string;
              data?: string;
            }[]) {
              pending.set(String(item.id), {
                id: String(item.id),
                title: item.title,
                body: item.body,
                data: item.data ?? null,
                at: item.at,
                every: item.every ?? null,
                next: item.every ? item.at + 60_000 : null,
                date: null,
                ours: true,
              });
            }
            return null;
          case "notify.pending":
            return [
              ...pending.values(),
              {
                id: "push-1",
                title: "x",
                body: "",
                data: null,
                at: null,
                every: null,
                next: null,
                date: null,
                ours: false,
              },
            ];
          case "notify.delivered":
            return [...delivered.values()];
          case "notify.removePending":
            for (const id of args!.ids as string[]) pending.delete(id);
            return null;
          case "notify.removeDelivered":
            for (const id of args!.ids as string[]) delivered.delete(id);
            return null;
        }
        throw new Error(`unexpected ${op}`);
      },
    });
    const call = (method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "local-notifications", method, args }));
    const deliver = (id: string) => {
      const r = pending.get(id)!;
      delivered.set(id, { ...r, date: 1_700_000_000_000 });
      if (!r.every) pending.delete(id);
      return r;
    };
    return { ops, emitted, call, native, deliver, delivered };
  }

  test("schedule → pending → cancel, the iOS layout (id, data as JSON text, repeat)", async () => {
    const { ops, call } = setup();
    const at = Date.now() + 60_000;
    const res = await call("schedule", {
      notifications: [
        { id: 1, title: "T", body: "b", at, data: { k: [1] } },
        { id: 2, title: "R", body: "", at, every: "minute" },
      ],
    });
    expect(res).toMatchObject({ ok: true, result: { ids: [1, 2] } });
    expect(ops.find((o) => o.op === "notify.add")!.args).toEqual({
      items: [
        { id: 1, title: "T", body: "b", at, data: '{"k":[1]}' },
        { id: 2, title: "R", body: "", at, every: "minute" },
      ],
      app,
    });
    // Other requests of the app (no marker) are not listed; a repeat reports its next date.
    expect(await call("getPending")).toMatchObject({
      result: {
        notifications: [
          { id: 1, title: "T", body: "b", at, data: { k: [1] } },
          { id: 2, title: "R", at: at + 60_000, every: "minute" },
        ],
      },
    });
    await call("cancel", { ids: [1, 2] });
    expect(await call("getPending")).toMatchObject({ result: { notifications: [] } });
    expect(ops.find((o) => o.op === "notify.removePending")!.args).toEqual({ ids: ["1", "2"], app });
  });

  test("received, and actions buffered until the page listens (C2)", async () => {
    const { call, native, deliver, emitted, delivered } = setup();
    await call("schedule", {
      notifications: [
        { id: 5, title: "Hi", body: "", at: Date.now() + 5_000 },
        { id: 6, title: "Later", body: "", at: Date.now() + 5_000 },
      ],
    });
    const r5 = deliver("5");
    const r6 = deliver("6");
    native.get("notification")!({ type: "notification", event: "action", notification: r5 }); // before anyone listens
    await call("$listen", { event: "received" });
    native.get("notification")!({ type: "notification", event: "received", notification: r6 });
    expect(emitted).toEqual([{ event: "received", data: { id: 6, title: "Later", body: "" } }]);
    await call("$listen", { event: "action" });
    expect(emitted.at(-1)).toEqual({ event: "action", data: { id: 5, title: "Hi", body: "" } });
    expect(await call("getDelivered")).toMatchObject({
      result: { notifications: [{ id: 5, at: 1_700_000_000_000 }, { id: 6 }] },
    });
    await call("removeAllDelivered");
    expect(delivered.size).toBe(0);
  });

  test("permission states; schedule without permission is PERMISSION_DENIED; bad arguments", async () => {
    const { call, ops } = setup(0);
    expect(await call("checkPermission")).toMatchObject({ result: { display: "prompt" } });
    expect(await call("schedule", { notifications: [{ id: 1, title: "T", at: "tomorrow" }] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await call("schedule", { notifications: [{ id: 1, title: "T", body: "", at: Date.now() }] })).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(await call("requestPermission", { provisional: true })).toMatchObject({ result: { display: "granted" } });
    // Provisional → a full request still asks; granted → no second request.
    expect(await call("requestPermission")).toMatchObject({ result: { display: "granted" } });
    expect(await call("requestPermission")).toMatchObject({ result: { display: "granted" } });
    expect(ops.filter((o) => o.op === "notify.request").map((o) => o.args)).toEqual([
      { provisional: true, app },
      { provisional: false, app },
    ]);
    expect(permissionState(1)).toBe("denied");
  });
});
