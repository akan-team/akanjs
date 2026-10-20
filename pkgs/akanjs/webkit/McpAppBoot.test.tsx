import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { ID } from "akanjs/base";
import type { ReactNode } from "react";
import { MCP_APP_META } from "../signal/mcp/mcpProtocol";
import type { McpAppBootProps } from "./McpAppBoot";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
process.env.AKAN_PUBLIC_LOCALES = "en,ko";
//? Imported once the env is set: the store module reads it while it loads.
const { McpAppBoot } = await import("./McpAppBoot");
const { csrLocation, page, router } = await import("akanjs/client");
const { FetchClient } = await import("akanjs/fetch");

interface Sent {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}
const sent: Sent[] = [];
const fromHostListeners: ((event: { source: unknown; data: unknown }) => void)[] = [];
const host = { postMessage: (message: Sent) => void sent.push(message) };
Object.defineProperty(window, "parent", { configurable: true, value: host });
const addEventListener = window.addEventListener.bind(window);
window.addEventListener = ((type: string, listener: never, options?: never) => {
  if (type === "message") fromHostListeners.push(listener);
  else addEventListener(type, listener, options);
}) as typeof window.addEventListener;
Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
globalThis.__AKAN_EMBED__ = { kind: "mcp-app", origin: "https://app.example.com" };
//? The boot renders on its own, as the view does, outside any `act()`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const fromHost = (data: object) => {
  for (const listener of fromHostListeners) listener({ source: host, data: { jsonrpc: "2.0", ...data } });
};
const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const lastRequest = (method: string) => sent.filter((message) => message.method === method).at(-1);

const memoId = "507f1f77bcf86cd799439011";
const Broken = () => {
  throw new Error("a read failed while it drew");
};
const memoPage = {
  default: page()
    .param("memoId", ID)
    .app("showMemo", "Show one memo.", ({ memoId, lang }) => <p>{`memo ${memoId} in ${lang}`}</p>)
    .app("failMemo", "Fails to load.", () => {
      throw new Error("the load broke");
    })
    .app("brokenMemo", "Fails to draw.", () => <Broken />)
    .render(() => null),
};
const root = {
  McpAppRoot: ({ children, params, path }: { children: ReactNode; params: { lang: string }; path: string }) => (
    <main data-lang={params.lang} data-path={path}>
      {children}
    </main>
  ),
};
const started = {
  structuredContent: { href: `/en/memo/${memoId}`, params: { lang: "en", memoId }, searchParams: {} },
  _meta: { [MCP_APP_META.snapshot]: [] },
};

const boot = async (
  app: string,
  toolResult: object,
  hostContext: object = {},
  { basePath, rootOverrides, overrides }: Pick<McpAppBootProps, "basePath" | "rootOverrides" | "overrides"> = {},
) => {
  sent.length = 0;
  fromHostListeners.length = 0;
  document.body.innerHTML = '<div id="root"></div>';
  const booting = McpAppBoot.run({ app, page: memoPage, root, basePath, rootOverrides, overrides });
  fromHost({ id: lastRequest("ui/initialize")?.id, result: { hostContext, hostCapabilities: {} } });
  await settle(0);
  fromHost({ method: "ui/notifications/tool-result", params: toolResult });
  await booting;
  await settle();
};

describe("McpAppBoot", () => {
  test("draws the app's element in the host's language, inside the root layout's provider, over the host's relay", async () => {
    await boot("showMemo", started, { locale: "ko-KR" });
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-lang")).toBe("ko");
    expect(main?.getAttribute("data-path")).toBe(`/memo/${memoId}`);
    expect(main?.textContent).toBe(`memo ${memoId} in ko`);
    expect(document.documentElement.lang).toBe("ko");
    expect(FetchClient.bridged).toBe(true);
  });

  test("draws the element inside the `_overrides.tsx` over its page, outermost first, the root layout's around it", async () => {
    await boot(
      "showMemo",
      started,
      {},
      {
        rootOverrides: [({ children }) => <div data-override="root">{children}</div>],
        overrides: [
          ({ children }) => <section data-override="outer">{children}</section>,
          ({ children }) => <article data-override="inner">{children}</article>,
        ],
      },
    );
    expect(document.querySelector("#root > div > main > section > article > p")?.textContent).toBe(
      `memo ${memoId} in en`,
    );
  });

  test("opens a screen the app moves to as that screen's web page, through the host", async () => {
    await boot("showMemo", started);
    router.push("/memo/2");
    await settle();
    expect(lastRequest("ui/open-link")?.params).toEqual({ url: "https://app.example.com/en/memo/2" });
  });

  test("keeps its basePath and its own screen, not the host's sandbox, in what it opens", async () => {
    const href = `/en/admin/memo/${memoId}`;
    await boot(
      "showMemo",
      { ...started, structuredContent: { ...started.structuredContent, href } },
      {},
      {
        basePath: "admin",
      },
    );
    expect(csrLocation.pathname).toBe(href);
    router.push(`${csrLocation.pathname}#notes`);
    await settle();
    expect(lastRequest("ui/open-link")).toBeUndefined();
    router.push("/memo/2");
    await settle();
    expect(lastRequest("ui/open-link")?.params).toEqual({ url: "https://app.example.com/en/admin/memo/2" });
    router.setLang("ko");
    await settle();
    expect(lastRequest("ui/open-link")?.params).toEqual({ url: `https://app.example.com/ko/admin/memo/${memoId}` });
  });

  test("says why it draws nothing for a result that starts no app, or an app that fails to load or to draw", async () => {
    await boot("showMemo", {
      content: [{ type: "text", text: "No screen exists for these arguments." }],
      isError: true,
    });
    expect(document.body.textContent).toBe("No screen exists for these arguments.");
    await boot("failMemo", started);
    expect(document.body.textContent).toBe("The page failed to load.");
    await boot("brokenMemo", started);
    expect(document.body.textContent).toBe("The page failed to load.");
  });
});
