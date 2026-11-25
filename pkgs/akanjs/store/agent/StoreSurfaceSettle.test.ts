import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { Translator } from "akanjs/client/translator";
import { AgenticSurface } from "use-agentic";
import { setTestEnv } from "../store.fixture";
import { StoreSurfaceSource } from "./StoreSurfaceSource";

beforeAll(() => {
  setTestEnv("surfacesettle");
  Translator.setActiveLocale("en");
});

describe("StoreSurfaceSource on a page that streams in", () => {
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
});
