import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "../ui/testHelpers.fixture";

let ClientPathWrapper: typeof import("../ui/System/Client").ClientPathWrapper;
let usePageLocation: typeof import("./usePageLocation").usePageLocation;
let setState: (state: Record<string, unknown>) => void;

beforeAll(async () => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "http://localhost/en/list?b=2&a=1&utm_source=x",
  );
  setTestEnv("pagelocationhydration");
  const { st } = await import("akanjs/store");
  setState = (state) => (st as unknown as { set: (state: Record<string, unknown>) => void }).set(state);
  ({ ClientPathWrapper } = await import("../ui/System/Client"));
  ({ usePageLocation } = await import("./usePageLocation"));
});

const Probe = () => <p>{JSON.stringify(usePageLocation().searchParams)}</p>;

const renderOnServer = async (node: ReactNode) => {
  const saved = (["window", "document"] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name] of saved) Reflect.deleteProperty(globalThis, name);
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  }
};

describe("usePageLocation on a page rendered with its sorted query", () => {
  test("hydrates with the query the server rendered and follows the URL once its query moves", async () => {
    const page = (
      <ClientPathWrapper
        initialPathname="/en/list"
        initialPath="/list"
        initialParams={{ lang: "en" }}
        initialSearch="a=1&b=2"
      >
        <Probe />
      </ClientPathWrapper>
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = await renderOnServer(page);
    const serverText = container.textContent;
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | null = null;
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (/hydrat|did not match/i.test(String(args[0]))) errors.push(args[0]);
    };
    try {
      await act(async () => {
        root = hydrateRoot(container, page, { onRecoverableError: (error) => errors.push(error) });
      });
    } finally {
      console.error = consoleError;
    }
    const hydratedText = container.textContent;
    await act(async () => {
      setState({ searchParams: { b: "2", a: "1", utm_source: "x" } });
    });
    const syncedText = container.textContent;
    await act(async () => {
      setState({ searchParams: { b: "2", a: "1", utm_source: "x", page: "2" } });
    });

    expect(errors).toEqual([]);
    expect(serverText).toBe(JSON.stringify({ a: "1", b: "2" }));
    expect(hydratedText).toBe(serverText);
    expect(syncedText).toBe(serverText);
    expect(container.textContent).toBe(JSON.stringify({ b: "2", a: "1", utm_source: "x", page: "2" }));
    act(() => root?.unmount());
    container.remove();
  });
});
