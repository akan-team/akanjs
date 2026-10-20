import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";
import { AKAN_RSC_CURRENT_ROUTE_HEADER, AKAN_RSC_RESPONSE_STATE_HEADER, encodeAkanRouterState } from "./routeState";

const origin = "http://localhost";
//? A Flight row for the whole document, so the root that hydrates `document` gets a tree it can own.
const rowOf = (text: string) =>
  `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(text)}}]}]]}]\n`;
const responseOf = (text: string) => new Response(rowOf(text), { headers: { "Content-Type": "text/x-component" } });
const shown = () => document.querySelector("main")?.textContent;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i += 1)
    await act(async () => {
      await sleep(5);
    });
};
const navigate = async (href: string, options?: { shallow?: boolean; replace?: boolean }) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
  });
};
const refresh = async () => {
  await act(async () => {
    await globalThis.__AKAN_RSC_REFRESH__?.();
  });
};
const back = async (expected: string) => {
  await act(async () => window.history.back());
  await waitFor(() => shown() === expected);
};
const served = new Map<string, () => Response>();
const fetched: { pathname: string; sentRouterState: boolean }[] = [];
const fetchCountOf = (pathname: string) => fetched.filter((request) => request.pathname === pathname).length;
const sentRouterStateFor = (pathname: string) =>
  fetched.findLast((request) => request.pathname === pathname)?.sentRouterState;
const routedResponseOf = (text: string) =>
  new Response(rowOf(text), {
    headers: {
      "Content-Type": "text/x-component",
      [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState({
        version: 1,
        href: text,
        routeId: text,
        segments: [
          { key: "root", path: "/", kind: "root-layout" },
          { key: text, path: text, kind: "page" },
        ],
      }),
    },
  });
const preStreamRedirectTo = (location: string) => () =>
  new Response(JSON.stringify({ type: "redirect", location, method: "replace", status: 307 }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Akan-Redirect": location,
      "X-Akan-Redirect-Method": "replace",
      "X-Akan-Redirect-Status": "307",
    },
  });
const lateRedirectTo = (location: string) => () => {
  const encoder = new TextEncoder();
  const digest = `AKAN_REDIRECT;replace;307;${encodeURIComponent(location)}`;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(rowOf("$L1")));
      await sleep(20);
      controller.enqueue(encoder.encode(`1:E${JSON.stringify({ digest, message: `Redirect to ${location}` })}\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/x-component" } });
};
const writeCookie = (entry: string) => {
  // biome-ignore lint/suspicious/noDocumentCookie: setAuth signs a page in through the jar, the one `/__rsc` carries.
  document.cookie = entry;
};
const signIn = (account: string) => writeCookie(`jwt:test=${account}; path=/`);
const signOut = () => writeCookie("jwt:test=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/");

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/list`);
  Object.assign(globalThis, {
    //? happy-dom swaps in a TransformStream of its own, which the runtime's ReadableStream refuses to pipe through.
    TransformStream,
    __webpack_require__: Object.assign(() => ({}), { u: () => "" }),
    __webpack_chunk_load__: async () => undefined,
    __RSC_CHUNKS__: [[1, rowOf("/list")]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL, init?: RequestInit) => {
      const target = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      const sentRouterState = new Headers(init?.headers).has(AKAN_RSC_CURRENT_ROUTE_HEADER);
      fetched.push({ pathname: target.pathname, sentRouterState });
      return served.get(target.pathname)?.() ?? responseOf(`${target.pathname}${target.search}`);
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/list</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
  await waitFor(() => !!globalThis.__AKAN_RSC_NAVIGATE__);
});

describe("rscClient history", () => {
  test("a shallow entry whose render a same-path push replaced renders again when history returns to it", async () => {
    await navigate("/list?peek=a", { shallow: true });
    expect(shown()).toBe("/list");
    await navigate("/list?page=2");
    expect(shown()).toBe("/list?page=2");

    await back("/list?peek=a");

    expect(window.location.search).toBe("?peek=a");
    expect(shown()).toBe("/list?peek=a");
  });

  test("a refresh on a shallow entry renders for its href, so the entry before it renders again on back", async () => {
    await navigate("/feed");
    await navigate("/feed?peek=b", { shallow: true });
    expect(shown()).toBe("/feed");
    await refresh();
    expect(shown()).toBe("/feed?peek=b");

    await back("/feed");

    expect(window.location.search).toBe("");
    expect(shown()).toBe("/feed");
  });
});

describe("rscClient scroll restoration", () => {
  test("a move back restores the offset its entry was left at, and a push starts at the top", async () => {
    await navigate("/blog");
    window.scrollTo(0, 600);
    await navigate("/blog/post");
    expect(window.scrollY).toBe(0);
    window.scrollTo(0, 3000);

    await back("/blog");

    expect(window.scrollY).toBe(600);
    expect(window.history.scrollRestoration).toBe("manual");
  });

  test("an entry left by a push keeps its offset in its state for a document loaded back into it", async () => {
    await navigate("/docs");
    window.scrollTo(0, 420);
    await navigate("/docs/next");

    await back("/docs");

    expect((window.history.state as { __akanRouter?: { scrollY?: number } }).__akanRouter?.scrollY).toBe(420);
  });

  test("a shallow entry restores its offset without rendering the page again", async () => {
    await navigate("/shop");
    window.scrollTo(0, 250);
    await navigate("/shop?peek=c", { shallow: true });
    window.scrollTo(0, 900);

    await act(async () => window.history.back());

    expect(shown()).toBe("/shop");
    expect(window.scrollY).toBe(250);
  });
});

describe("rscClient account change", () => {
  test("a redirect answered while signed out is not replayed after sign-in", async () => {
    signOut();
    served.set("/private", preStreamRedirectTo("/signin"));
    await navigate("/private");
    await waitFor(() => shown() === "/signin");
    expect(window.location.pathname).toBe("/signin");

    signIn("member");
    served.delete("/private");
    await navigate("/private");
    await waitFor(() => shown() === "/private");

    expect(fetchCountOf("/private")).toBe(2);
    expect(shown()).toBe("/private");
  });

  test("a redirect raised mid-stream while signed out is not replayed after sign-in", async () => {
    signOut();
    served.set("/vault", lateRedirectTo("/signin"));
    await navigate("/vault");
    await waitFor(() => window.location.pathname === "/signin");
    expect(window.location.pathname).toBe("/signin");

    signIn("member");
    served.delete("/vault");
    await navigate("/vault");
    await waitFor(() => shown() === "/vault");

    expect(fetchCountOf("/vault")).toBe(2);
    expect(shown()).toBe("/vault");
  });

  test("a page rendered while signed out is asked for again after sign-in", async () => {
    signOut();
    served.set("/dashboard", () => responseOf("guest"));
    await navigate("/dashboard");
    expect(shown()).toBe("guest");
    await navigate("/home");

    signIn("member");
    served.set("/dashboard", () => responseOf("member"));
    await navigate("/dashboard");

    expect(fetchCountOf("/dashboard")).toBe(2);
    expect(shown()).toBe("member");
  });

  test("a page rendered for an account is not replayed after sign-out", async () => {
    signIn("owner");
    served.set("/account", () => responseOf("secret"));
    await navigate("/account");
    expect(shown()).toBe("secret");
    await navigate("/home2");

    signOut();
    served.set("/account", preStreamRedirectTo("/signin"));
    await navigate("/account");
    await waitFor(() => window.location.pathname === "/signin");

    expect(fetchCountOf("/account")).toBe(2);
    expect(window.location.pathname).toBe("/signin");
  });

  test("going back after sign-out asks the server again instead of showing the account's page", async () => {
    signIn("owner");
    served.set("/inbox", () => responseOf("mail"));
    await navigate("/inbox");
    expect(shown()).toBe("mail");
    await navigate("/settings");

    signOut();
    served.set("/inbox", preStreamRedirectTo("/signin"));
    await act(async () => window.history.back());
    await waitFor(() => window.location.pathname === "/signin");

    expect(fetchCountOf("/inbox")).toBe(2);
    expect(shown()).toBe("/signin");
  });

  test("a cookie that names no account leaves the cached pages in place", async () => {
    signIn("owner");
    served.set("/gallery", () => responseOf("pictures"));
    await navigate("/gallery");
    await navigate("/lobby");

    writeCookie("theme=dark; path=/");
    await navigate("/gallery");

    expect(fetchCountOf("/gallery")).toBe(1);
    expect(shown()).toBe("pictures");
  });

  test("the first page after an account change is rendered whole, not patched onto the old layouts", async () => {
    signIn("owner");
    served.set("/club", () => routedResponseOf("/club"));
    await navigate("/club");
    await navigate("/club/plan");
    expect(sentRouterStateFor("/club/plan")).toBe(true);

    served.set("/team", () => routedResponseOf("/team"));
    await navigate("/team");
    signIn("lead");
    await navigate("/team/plan");

    expect(sentRouterStateFor("/team/plan")).toBe(false);
  });
});
