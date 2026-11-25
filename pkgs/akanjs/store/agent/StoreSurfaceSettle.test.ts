import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { Translator } from "akanjs/client/translator";
import { AgenticSurface } from "use-agentic";
import { AgentNavigate } from "../agentic/AgentNavigate";
import { setTestEnv } from "../store.fixture";
import { StoreSurfaceSource } from "./StoreSurfaceSource";

beforeAll(() => {
  setTestEnv("surfacesettle");
  Translator.setActiveLocale("en");
});

describe("StoreSurfaceSource on a page that streams in", () => {
  test("a path refused after the page went back lists the links the screen showed before the move", async () => {
    const { router } = await import("akanjs/client");
    const shown = ["/en/home"];
    Object.defineProperty(window.history, "state", {
      get: () => ({ __akanRouter: { idx: shown.length - 1 } }),
      configurable: true,
    });
    router.init({
      type: "ssr",
      side: "client",
      lang: "en",
      router: {
        push: (href: string) => {
          shown.push(href);
          document.body.innerHTML = "<main>missing</main>";
        },
        replace: () => undefined,
        back: () => {
          shown.pop();
          document.body.innerHTML = '<nav style="display: none"><a href="/en/tickets">Tickets</a></nav>';
        },
        refresh: () => undefined,
      },
    } as never);
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("http://localhost/en/home");
    document.body.innerHTML = '<nav><a href="/en/tickets">Tickets</a><a href="/en/org/o1">Org</a></nav>';
    globalThis.__AKAN_NOT_FOUND_VIEW__ = () => shown.at(-1)?.endsWith("/no/such") ?? false;
    const surface = new AgenticSurface();
    surface.addSource(new StoreSurfaceSource());
    try {
      await expect(surface.call("navigate", { path: "/no/such" })).rejects.toThrow(
        "Paths this screen links to: /tickets, /org/o1.",
      );
    } finally {
      globalThis.__AKAN_NOT_FOUND_VIEW__ = undefined;
      document.body.innerHTML = "";
      const nowhere = () => undefined;
      router.init({
        type: "ssr",
        side: "client",
        lang: "en",
        router: { push: nowhere, replace: nowhere, back: nowhere, refresh: nowhere },
      } as never);
    }
  });

  test("navigate reports arrival only once a section streamed in after the page has landed", async () => {
    const { router } = await import("akanjs/client");
    router.init({ side: "server", routeManifest: [] } as never);
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
      "http://localhost/en/docs/intro",
    );
    const surface = new AgenticSurface();
    surface.addSource(new StoreSurfaceSource());
    const section = document.createElement("section");
    section.innerHTML = "<template data-akan-loading></template>";
    document.body.appendChild(section);
    setTimeout(() => {
      section.innerHTML = "<ul><li>card</li></ul>";
    }, 1200);
    const started = performance.now();

    expect(await surface.call("navigate", { path: "/docs/intro" })).toContain("Now on /docs/intro.");
    expect(performance.now() - started).toBeGreaterThanOrEqual(1200);
    section.remove();
  });

  test("an app's own description and wait replace navigate's, read at every call", async () => {
    const { router } = await import("akanjs/client");
    router.init({ side: "server", routeManifest: [] } as never);
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
      "http://localhost/en/boards/b1",
    );
    const surface = new AgenticSurface();
    surface.addSource(new StoreSurfaceSource());
    const describedOf = () => surface.snapshot().tools.find((tool) => tool.name === "navigate")?.description;
    const runtimeOwn = describedOf();
    const waits: string[] = [];
    let release: () => void = () => undefined;
    AgentNavigate.set({
      description: "Open a board at /boards/<id>.",
      settle: async (settled) => {
        await settled();
        waits.push("runtime");
        await new Promise<void>((resolve) => (release = resolve));
        waits.push("app");
      },
    });
    try {
      expect(describedOf()).toBe("Open a board at /boards/<id>.");
      const moved = surface.call("navigate", { path: "/boards/b1" });
      while (!waits.length) await new Promise((resolve) => setTimeout(resolve, 20));
      const held = await Promise.race([moved, new Promise((resolve) => setTimeout(() => resolve("held"), 100))]);
      expect(held).toBe("held");
      release();
      expect(await moved).toContain("Now on /boards/b1.");
      expect(waits).toEqual(["runtime", "app"]);
    } finally {
      AgentNavigate.set({ description: undefined, settle: undefined });
    }
    expect(describedOf()).toBe(runtimeOwn);
  });
});
