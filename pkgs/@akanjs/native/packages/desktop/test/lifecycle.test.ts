import { describe, expect, test } from "bun:test";
import { createLifecycle, type LifecycleOptions } from "../src/lifecycle.ts";
import { createPageVeto } from "../src/page-veto.ts";

function setup(options: Partial<LifecycleOptions> = {}) {
  const log: string[] = [];
  const lifecycle = createLifecycle({
    quitOnLastWindowClosed: true,
    exit: (code) => void log.push(`exit ${code}`),
    cancelSessionEnd: () => void log.push("cancel session"),
    hideWindow: async () => void log.push("hide"),
    ...options,
  });
  return { lifecycle, log };
}

describe("desktop lifecycle (plugins.md D4)", () => {
  test("close without vetoes quits after the quit hooks", async () => {
    const { lifecycle, log } = setup();
    lifecycle.onQuit(async () => {
      await Bun.sleep(5);
      log.push("hook");
    });
    await lifecycle.closeRequested();
    await Bun.sleep(20);
    expect(log).toEqual(["hook", "exit 0"]);
  });

  test("a close veto keeps the window; quitOnLastWindowClosed: false hides instead of quitting", async () => {
    const { lifecycle, log } = setup({ quitOnLastWindowClosed: false });
    let keep = true;
    lifecycle.onCloseRequested(() => !keep);
    await lifecycle.closeRequested();
    expect(log).toEqual([]);
    keep = false;
    await lifecycle.closeRequested();
    expect(log).toEqual(["hide"]);
  });

  test("closing the last window asks the quit vetoes with reason lastWindowClosed", async () => {
    const { lifecycle, log } = setup();
    const reasons: string[] = [];
    lifecycle.onBeforeQuit(({ reason }) => {
      reasons.push(reason);
      return false;
    });
    await lifecycle.closeWindow();
    expect(reasons).toEqual(["lastWindowClosed"]);
    expect(log).toEqual([]);
  });

  test("user quit: vetoed stays; allowed after an async decision quits; a broken veto does not block", async () => {
    const { lifecycle, log } = setup();
    let answer: boolean | undefined = false;
    const stop = lifecycle.onBeforeQuit(async () => {
      await Bun.sleep(5);
      return answer;
    });
    expect(await lifecycle.requestQuit("user")).toBe(false);
    expect(log).toEqual([]); // no cancelSessionEnd for a user request: the shell already said no to AppKit
    stop();
    lifecycle.onBeforeQuit(() => {
      throw new Error("broken");
    });
    answer = undefined;
    expect(await lifecycle.requestQuit("user")).toBe(true);
    await Bun.sleep(5);
    expect(log).toEqual(["exit 0"]);
  });

  test("repeated requests while deciding share one decision; nothing is asked after quitting starts", async () => {
    const { lifecycle, log } = setup();
    let asked = 0;
    let release!: (v: boolean) => void;
    lifecycle.onBeforeQuit(() => {
      asked++;
      return new Promise<boolean>((r) => (release = r));
    });
    const a = lifecycle.requestQuit("user");
    const b = lifecycle.requestQuit("user");
    await Bun.sleep(1);
    expect(asked).toBe(1);
    release(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(await lifecycle.requestQuit("user")).toBe(true);
    await lifecycle.closeRequested();
    await Bun.sleep(5);
    expect(asked).toBe(1);
    expect(log).toEqual(["exit 0"]);
  });

  test("a vetoed logout is cancelled explicitly, also when it arrived during a user decision", async () => {
    const { lifecycle, log } = setup();
    lifecycle.onBeforeQuit(() => false);
    expect(await lifecycle.requestQuit("session")).toBe(false);
    expect(log).toEqual(["cancel session"]);

    const other = setup();
    let release!: (v: boolean) => void;
    other.lifecycle.onBeforeQuit(() => new Promise<boolean>((r) => (release = r)));
    const user = other.lifecycle.requestQuit("user");
    const session = other.lifecycle.requestQuit("session");
    release(false);
    expect(await Promise.all([user, session])).toEqual([false, false]);
    expect(other.log).toEqual(["cancel session"]);
  });

  test("quit() skips the vetoes and waits for hung hooks only until the timeout", async () => {
    const { lifecycle, log } = setup({ quitHookTimeout: 30 });
    lifecycle.onBeforeQuit(() => false);
    lifecycle.onQuit(() => new Promise(() => {}));
    lifecycle.onQuit(() => {
      throw new Error("broken hook");
    });
    const started = Date.now();
    await lifecycle.quit(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(log).toEqual(["exit 3"]);
    await lifecycle.quit(4); // once
    expect(log).toEqual(["exit 3"]);
  });

  test("unregistered hooks and vetoes are not called", async () => {
    const { lifecycle, log } = setup();
    lifecycle.onBeforeQuit(() => false)();
    lifecycle.onQuit(() => void log.push("hook"))();
    expect(await lifecycle.requestQuit("user")).toBe(true);
    await Bun.sleep(5);
    expect(log).toEqual(["exit 0"]);
  });
});

describe("page veto", () => {
  test("nobody listening: allowed at once", async () => {
    const veto = createPageVeto();
    expect(veto.listening).toBe(false);
    expect(await veto.ask({})).toBe(true);
  });

  test("received, then the page decides as slowly as it likes", async () => {
    const veto = createPageVeto<{ reason: string }>(20);
    const sent: { id: number; reason: string }[] = [];
    veto.source((data) => sent.push(data));
    const answer = veto.ask({ reason: "user" });
    expect(sent).toEqual([{ reason: "user", id: 1 }]);
    veto.answer({ id: 1 }); // received
    await Bun.sleep(40); // longer than the ack timeout
    veto.answer({ id: 1, allow: false });
    expect(await answer).toBe(false);
    veto.answer({ id: 1, allow: true }); // late answers are ignored
  });

  test("a page that never confirms counts as allowing; a page that goes away drops the request", async () => {
    const veto = createPageVeto(20);
    const stop = veto.source(() => {});
    expect(await veto.ask({})).toBe(true);
    const pending = veto.ask({});
    stop();
    expect(await pending).toBe(false);
    expect(veto.listening).toBe(false);
  });

  test("answers are validated", () => {
    const veto = createPageVeto();
    expect(() => veto.answer({ id: "1" })).toThrow("id must be a number");
    expect(() => veto.answer({ id: 1, allow: "yes" })).toThrow("allow must be a boolean");
    expect(() => veto.answer({ id: 99, allow: true })).not.toThrow();
  });
});

describe("windows (SH-6)", () => {
  function windowsSetup(open: number[], options: Partial<LifecycleOptions> = {}) {
    const alive = new Set(open);
    const s = setup({
      windows: async () => [...alive],
      destroyWindow: async (w) => {
        alive.delete(w);
        s.log.push(`destroy ${w}`);
      },
      hideWindow: async (w) => void s.log.push(`hide ${w}`),
      ...options,
    });
    return { ...s, alive };
  }

  test("closing a window while others exist destroys it (window 1 too); the last one quits", async () => {
    const { lifecycle, log } = windowsSetup([1, 2, 3]);
    await lifecycle.closeRequested(2);
    await lifecycle.closeRequested(1);
    expect(log).toEqual(["destroy 2", "destroy 1"]);
    await lifecycle.closeRequested(3);
    await Bun.sleep(5);
    expect(log).toEqual(["destroy 2", "destroy 1", "exit 0"]);
  });

  test("the last window hides with quitOnLastWindowClosed: false; hidden windows still count", async () => {
    const { lifecycle, log } = windowsSetup([1, 2], { quitOnLastWindowClosed: false });
    await lifecycle.closeWindow(1);
    expect(log).toEqual(["destroy 1"]);
    await lifecycle.closeWindow(2);
    expect(log).toEqual(["destroy 1", "hide 2"]);
  });

  test("close vetoes see which window; each window decides on its own", async () => {
    const { lifecycle, log } = windowsSetup([1, 2]);
    const asked: number[] = [];
    let release!: (v: boolean) => void;
    lifecycle.onCloseRequested(({ window }) => {
      asked.push(window);
      return window === 2 ? new Promise<boolean>((r) => (release = r)) : false;
    });
    const two = lifecycle.closeRequested(2);
    const again = lifecycle.closeRequested(2); // clicked twice: one decision
    await lifecycle.closeRequested(1); // vetoed
    release(true);
    await Promise.all([two, again]);
    expect(asked).toEqual([2, 1]);
    expect(log).toEqual(["destroy 2"]);
  });
});

describe("page veto across windows", () => {
  test("every asked page must allow; one prevent wins", async () => {
    const veto = createPageVeto(50);
    veto.source(() => [1, 2]);
    const first = veto.ask({});
    veto.answer({ id: 1, allow: true }, 1);
    veto.answer({ id: 1, allow: true }, 3); // not asked: ignored
    await Bun.sleep(1);
    veto.answer({ id: 1, allow: true }, 2);
    expect(await first).toBe(true);
    const second = veto.ask({});
    veto.answer({ id: 2, allow: true }, 1);
    veto.answer({ id: 2, allow: false }, 2);
    expect(await second).toBe(false);
  });

  test("an asked page that never confirms counts as allowing, one that confirmed is waited for", async () => {
    const veto = createPageVeto(20);
    veto.source(() => [1, 2]);
    const pending = veto.ask({});
    veto.answer({ id: 1 }, 2); // window 2 received it and decides
    await Bun.sleep(40); // window 1 never answered: allowing
    let settled = false;
    void pending.then(() => (settled = true));
    await Bun.sleep(1);
    expect(settled).toBe(false);
    veto.answer({ id: 1, allow: true }, 2);
    expect(await pending).toBe(true);
  });

  test("one window asked; nobody listening there allows at once; a page that goes away drops the request", async () => {
    let documentEnded: ((doc: { window: number; id: string }) => void) | null = null;
    const ctx = {
      onDocumentEnd: (fn: typeof documentEnded) => {
        documentEnded = fn;
        return () => {
          documentEnded = null;
        };
      },
    } as never;
    const sent: unknown[] = [];
    const veto = createPageVeto(1000);
    veto.source(
      (data, target) => (
        sent.push(target), target && typeof target === "object" ? (target.window === 2 ? [2] : []) : [1, 2]
      ),
      ctx,
    );
    expect(await veto.ask({}, { window: 3 })).toBe(true);
    const pending = veto.ask({}, { window: 2 });
    documentEnded!({ window: 1, id: "a".repeat(32) }); // another window's page: no effect
    documentEnded!({ window: 2, id: "b".repeat(32) }); // the asked page reloaded or its window is gone
    expect(await pending).toBe(false);
    expect(sent).toEqual([{ window: 3 }, { window: 2 }]);
  });
});
