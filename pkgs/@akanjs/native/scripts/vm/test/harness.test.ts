import { afterEach, describe, expect, test } from "bun:test";
import { AppPage, until } from "../harness.ts";

type Answer = (message: { id: number; method: string; params: { expression?: string } }) => object | "close";

let devtools: ReturnType<typeof Bun.serve> | null = null;
afterEach(() => {
  devtools?.stop(true);
  devtools = null;
});

//? The /json listing and one page's socket, as WebView2's debugging port serves them.
const pageAnswering = (answer: Answer) => {
  devtools = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request, server) => {
      if (new URL(request.url).pathname === "/page")
        return server.upgrade(request, { data: undefined }) ? undefined : new Response(null);
      return Response.json([
        { type: "page", url: "devtools://devtools/bundled/x", webSocketDebuggerUrl: "ws://127.0.0.1:1/none" },
        { type: "page", url: "https://app.localhost/", webSocketDebuggerUrl: `ws://127.0.0.1:${server.port}/page` },
      ]);
    },
    websocket: {
      message: (ws, data) => {
        const message = JSON.parse(String(data));
        const reply = answer(message);
        if (reply === "close") ws.close();
        else {
          ws.send(JSON.stringify({ method: "Runtime.consoleAPICalled", params: {} }));
          ws.send(JSON.stringify({ id: message.id, ...reply }));
        }
      },
    },
  });
  return new AppPage(devtools.port ?? 0);
};

describe("AppPage", () => {
  test("answers an evaluation with its value, skipping the page's events", async () => {
    const page = pageAnswering(() => ({ result: { result: { value: "board" } } }));
    expect(await page.evaluate("document.title", "title")).toEqual({ value: "board" });
  });

  test("says what an expression threw, and a bridge call that threw fails with it", async () => {
    const page = pageAnswering(() => ({
      result: { exceptionDetails: { text: "Uncaught", exception: { description: "TypeError: rt is undefined" } } },
    }));
    expect(await page.evaluate("rt.nextId", "next id")).toEqual({ exception: "TypeError: rt is undefined" });
    await expect(page.bridge("app", "getInfo")).rejects.toThrow("app.getInfo threw in the page: TypeError");
  });

  test("a call that closes the page answers closed instead of waiting out its deadline", async () => {
    const page = pageAnswering(() => "close");
    const startedAt = performance.now();
    expect(await page.bridge("app", "relaunch")).toEqual({ ok: true, closed: true });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  test("hands back the plugin's answer as the runtime sent it", async () => {
    const page = pageAnswering(() => ({ result: { result: { value: '{"ok":true,"result":{"fullscreen":true}}' } } }));
    expect(await page.bridge<{ fullscreen: boolean }>("window", "getState")).toEqual({
      ok: true,
      result: { fullscreen: true },
    });
  });
});

describe("until", () => {
  test("asks again past a check that throws, and names its last error when time runs out", async () => {
    let calls = 0;
    expect(await until("the third try", () => (++calls === 3 ? "ready" : undefined))).toBe("ready");
    await expect(
      until(
        "a page",
        () => {
          throw new Error("no app page yet");
        },
        300,
      ),
    ).rejects.toThrow("timed out waiting for a page (Error: no app page yet)");
  });
});
