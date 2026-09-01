import { beforeAll, describe, expect, test } from "bun:test";
import { AgenticSurface, type SurfaceSource, type SurfaceView } from "use-agentic";

let sessionView: typeof import("./sessionView").sessionView;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "viewtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "viewtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ sessionView } = await import("./sessionView"));
});

const runtimeSource: SurfaceSource = {
  tools: () => [
    { name: "navigate", run: async () => "went" },
    { name: "goBack", run: async () => "back" },
    { name: "readScreen", run: async () => "screen" },
    { name: "readState", run: async () => "state" },
    { name: "highlight", run: async () => "lit" },
  ],
};

const named = (view: SurfaceView) => view.snapshot().tools.map((tool) => tool.name);

describe("sessionView", () => {
  let surface: AgenticSurface;

  beforeAll(() => {
    surface = new AgenticSurface();
    surface.addSource(runtimeSource);
  });

  test("takes every built-in by default, and hands back the scoped view untouched", () => {
    expect(named(sessionView(surface, []))).toEqual(["goBack", "highlight", "navigate", "readScreen", "readState"]);
    expect(sessionView(surface, [], true)).toBe(surface);
  });

  test("`false` withholds them from the listing and from a call that names one anyway", async () => {
    const view = sessionView(surface, [], false);
    expect(named(view)).toEqual([]);
    expect(view.tool("navigate")).toBeNull();
    // The same answer a name that was never registered gets: a withheld tool must not be found by guessing it.
    expect(view.call("navigate")).rejects.toThrow("Unknown tool: navigate");
  });

  test("an array keeps exactly what it names", async () => {
    const view = sessionView(surface, [], ["readScreen", "readState"]);
    expect(named(view)).toEqual(["readScreen", "readState"]);
    expect(await view.call("readScreen")).toBe("screen");
    expect(view.call("goBack")).rejects.toThrow("Unknown tool: goBack");
  });

  test("a tool the screen declares under a built-in name survives, because it is not the runtime's", async () => {
    const own = new AgenticSurface();
    own.addSource(runtimeSource);
    own.registerTool([], { name: "navigate", description: "the app's own", run: async () => "app" });
    const view = sessionView(own, [], false);
    expect(named(view)).toEqual(["navigate"]);
    expect(await view.call("navigate")).toBe("app");
  });

  test("a root declaration does not rescue the built-in inside a zone that withheld it", () => {
    const own = new AgenticSurface();
    own.addSource(runtimeSource);
    own.registerTool([], { name: "navigate", run: async () => "root" });
    own.registerTool(["panel"], { name: "pick", run: async () => "picked" });
    const view = sessionView(own, ["panel"], false);
    // The root declaration is out of this view either way, so what `navigate` would have meant here is the
    // built-in — and that is the one being withheld.
    expect(named(view)).toEqual(["panel.pick"]);
  });
});
