import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type AccessibilityState, accessibility, checkAnnounce } from "../src/index.ts";

const g = globalThis as { matchMedia?: unknown; document?: unknown; getComputedStyle?: unknown };
let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
  delete g.matchMedia;
  delete g.document;
  delete g.getComputedStyle;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const tick = () => new Promise((r) => setTimeout(r, 1));

const iosState: AccessibilityState = { screenReader: false, reduceMotion: false, fontScale: 1 };

describe("accessibility arguments", () => {
  test("announce: text and priority", () => {
    expect(checkAnnounce({ text: "Saved" })).toEqual({ text: "Saved", priority: "polite" });
    expect(checkAnnounce({ text: "Error", priority: "assertive" })).toEqual({ text: "Error", priority: "assertive" });
    const cases: [unknown, string][] = [
      [undefined, "text is required"],
      [{ text: 3 }, "text must be a string"],
      [{ text: " \n" }, "text must not be empty"],
      [{ text: "x", priority: "loud" }, "priority must be one of polite, assertive"],
    ];
    for (const [options, message] of cases) {
      try {
        checkAnnounce(options);
        throw new Error(`accepted ${JSON.stringify(options)}`);
      } catch (e) {
        expect(isAkanNativeError(e, "INVALID_ARGS")).toBe(true);
        expect((e as Error).message).toBe(message);
      }
    }
  });

  test("manifest: iOS native, Android native state with the page's announcements, macOS the page", () => {
    const plugin = { spec: "accessibility", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({
      accessibility: { methods: ["getState", "announce"], events: ["change"] },
    });
    expect(pluginDecls([plugin], "android")).toEqual({
      accessibility: { methods: ["getState"], events: ["change"], web: true },
    });
    expect(pluginDecls([plugin], "macos")).toEqual({ accessibility: "web" });
  });
});

describe("accessibility routing", () => {
  test("iOS: every method and the change event are native", async () => {
    let state = iosState;
    const announced: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        accessibility: {
          methods: { getState: () => state, announce: (a: unknown) => void announced.push(a) },
          events: ["change"],
        },
      },
    });
    const seen: AccessibilityState[] = [];
    const stop = accessibility.listen("change", (s) => seen.push(s));
    await tick();
    expect(host.subscriptions("accessibility", "change")).toBe(1);
    state = { screenReader: true, reduceMotion: false, fontScale: 1.235 };
    host.emit("accessibility", "change", state);
    expect(await accessibility.getState()).toEqual(state);
    await accessibility.announce({ text: "3 results", priority: "assertive" });
    expect(announced).toEqual([{ text: "3 results", priority: "assertive" }]);
    expect(seen).toEqual([state]);
    stop();
  });

  test("Android: the state is native, announce runs in the page", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        accessibility: {
          methods: { getState: () => ({ screenReader: true, reduceMotion: true, fontScale: 1.3 }) },
          events: ["change"],
          web: true,
        },
      },
    });
    expect(accessibility.implementation("getState")).toBe("native");
    expect(accessibility.eventImplementation("change")).toBe("native");
    expect(accessibility.implementation("announce")).toBe("web");
    expect(await accessibility.getState()).toEqual({ screenReader: true, reduceMotion: true, fontScale: 1.3 });
    expect(isAkanNativeError(await rejection(accessibility.announce({ text: "" })), "INVALID_ARGS")).toBe(true);
    expect(isAkanNativeError(await rejection(accessibility.announce({ text: "hi" })), "UNSUPPORTED")).toBe(true); // no document in bun test
    expect(host.requests.map((r) => r.method)).toEqual(["getState"]);
  });
});

// ---------------------------------------------------------------- a minimal DOM for the page side

class FakeNode {
  readonly children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  readonly style = { cssText: "" };
  textContent = "";
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  append(child: FakeNode) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
  }
  remove() {
    const siblings = this.parentNode?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
}

function fakePage(options: { reduce?: boolean; fontPx?: number } = {}) {
  const media = Object.assign(new EventTarget(), {
    matches: options.reduce ?? false,
    media: "(prefers-reduced-motion: reduce)",
  });
  g.matchMedia = (query: string) => {
    expect(query).toBe("(prefers-reduced-motion: reduce)");
    return media;
  };
  let fontPx = options.fontPx ?? 16;
  g.getComputedStyle = () => ({ fontSize: `${fontPx}px` });
  const modals: FakeNode[] = [];
  const body = new FakeNode("body");
  const doc = Object.assign(new EventTarget(), {
    body,
    documentElement: new FakeNode("html"),
    visibilityState: "visible",
    createElement: (tag: string) => new FakeNode(tag),
    querySelectorAll: (selector: string) => (selector === "dialog:modal" ? modals : []),
  });
  g.document = doc;
  return {
    body,
    modals,
    setReduce(next: boolean) {
      media.matches = next;
      media.dispatchEvent(new Event("change"));
    },
    setFontPx(px: number) {
      fontPx = px;
    },
    show() {
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    region: (parent: FakeNode, priority: string) =>
      parent.children.find((c) => c.attributes.get("data-akan-native-announcer") === priority),
  };
}

describe("accessibility web implementation", () => {
  test("getState: no screen reader information, prefers-reduced-motion, the default font size", async () => {
    host = installMockHost({ platform: "web" });
    expect(await accessibility.getState()).toEqual({ screenReader: null, reduceMotion: false, fontScale: 1 });
    fakePage({ reduce: true, fontPx: 20 });
    expect(await accessibility.getState()).toEqual({ screenReader: null, reduceMotion: true, fontScale: 1.25 });
  });

  test("change: reduced motion switches, and a font size change seen when the page is shown again", async () => {
    host = installMockHost({ platform: "web" });
    const page = fakePage();
    const seen: AccessibilityState[] = [];
    const stop = accessibility.listen("change", (s) => seen.push(s));
    page.setReduce(true);
    page.show(); // nothing changed
    page.setFontPx(24);
    page.show();
    stop();
    await tick();
    page.setReduce(false); // no listener any more
    expect(seen).toEqual([
      { screenReader: null, reduceMotion: true, fontScale: 1 },
      { screenReader: null, reduceMotion: true, fontScale: 1.5 },
    ]);
  });

  test("announce: one live region per priority, a new node per message, into an open modal dialog", async () => {
    host = installMockHost({ platform: "macos", plugins: { accessibility: "web" } });
    const page = fakePage();
    await accessibility.announce({ text: "Saved" });
    const polite = page.region(page.body, "polite")!;
    expect(polite.attributes.get("aria-live")).toBe("polite");
    expect(polite.attributes.get("aria-relevant")).toBe("additions");
    expect(polite.style.cssText).toContain("clip-path:inset(50%)");
    expect(polite.style.cssText).not.toContain("display:none");
    await accessibility.announce({ text: "Saved" }); // repeated text is a new node, so it is read again
    expect(polite.children.map((c) => c.textContent)).toEqual(["Saved", "Saved"]);

    await accessibility.announce({ text: "Failed", priority: "assertive" });
    expect(page.region(page.body, "assertive")!.children.map((c) => c.textContent)).toEqual(["Failed"]);

    const dialog = new FakeNode("dialog");
    page.body.append(dialog);
    page.modals.push(dialog);
    await accessibility.announce({ text: "Inside" });
    expect(page.region(dialog, "polite")).toBe(polite);
    expect(page.region(page.body, "polite")).toBeUndefined();
    expect(polite.children.at(-1)!.textContent).toBe("Inside");

    page.modals.pop();
    dialog.remove(); // plugins/dialog removes the element when it closes
    await accessibility.announce({ text: "Back" });
    expect(page.region(page.body, "polite")).toBe(polite);
    expect(host.requests).toEqual([]);
  });
});
