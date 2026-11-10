import "../test/registerDom";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TransformStream } from "node:stream/web";
import { act } from "react";
import { Translator } from "../client/translator";
import { StaleReads } from "../fetch/staleReads";
import {
  AKAN_RSC_CURRENT_ROUTE_HEADER,
  AKAN_RSC_DICTIONARY_HEADER,
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PREFETCH_HEADER,
  AKAN_RSC_RESPONSE_STATE_HEADER,
  encodeAkanRouterState,
} from "./routeState";

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
const served = new Map<string, () => Response | Promise<Response>>();
const fetched: { pathname: string; sentRouterState: boolean; prefetch: boolean; signal?: AbortSignal }[] = [];
const fetchCountOf = (pathname: string) => fetched.filter((request) => request.pathname === pathname).length;
const signalOf = (pathname: string) => fetched.findLast((request) => request.pathname === pathname)?.signal;
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
const heldRedirectTo = (location: string) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const serve = () => {
    const encoder = new TextEncoder();
    const digest = `AKAN_REDIRECT;replace;307;${encodeURIComponent(location)}`;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(rowOf("$L1")));
        await held;
        controller.enqueue(encoder.encode(`1:E${JSON.stringify({ digest, message: `Redirect to ${location}` })}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/x-component" } });
  };
  return { serve, release: () => release() };
};
const redirectInFirstChunkTo = (location: string) => () => {
  const digest = `AKAN_REDIRECT;replace;307;${encodeURIComponent(location)}`;
  const rows = `${rowOf("$L1")}1:E${JSON.stringify({ digest, message: `Redirect to ${location}` })}\n`;
  return new Response(rows, { headers: { "Content-Type": "text/x-component" } });
};
const notFoundViewOf = (text: string) => () =>
  new Response(rowOf(text), {
    status: 404,
    headers: { "Content-Type": "text/x-component", [AKAN_RSC_NOT_FOUND_HEADER]: "view" },
  });
const bareNotFound = () => new Response("0:null\n", { status: 404, headers: { "Content-Type": "text/x-component" } });
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
      const headers = new Headers(init?.headers);
      const sentRouterState = headers.has(AKAN_RSC_CURRENT_ROUTE_HEADER);
      const prefetch = headers.get(AKAN_RSC_PREFETCH_HEADER) === "1";
      const signal = init?.signal ?? undefined;
      fetched.push({ pathname: target.pathname, sentRouterState, prefetch, signal });
      const response = served.get(target.pathname)?.() ?? responseOf(`${target.pathname}${target.search}`);
      if (!signal) return response;
      signal.throwIfAborted();
      return new Promise<Response>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        void Promise.resolve(response).then(resolve, reject);
      });
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

describe("rscClient overtaken navigation", () => {
  const heldUntilReleased = (text: string) => {
    const held = { release: () => {} };
    const respond = () =>
      new Promise<Response>((resolve) => {
        held.release = () => resolve(responseOf(text));
      });
    return { held, respond };
  };

  test("a move forward that keeps the page drops the move back still loading", async () => {
    await navigate("/thread/1");
    await navigate("/thread/2");
    await refresh();
    const { held, respond } = heldUntilReleased("/thread/1");
    served.set("/thread/1", respond);
    await act(async () => window.history.back());
    await act(async () => {
      await sleep(10);
    });
    await act(async () => window.history.forward());
    await act(async () => {
      await sleep(10);
    });

    await act(async () => {
      held.release();
      await sleep(30);
    });

    expect(window.location.pathname).toBe("/thread/2");
    expect(shown()).toBe("/thread/2");
  });

  test("a navigation overtaken before its page commits has its request cut once its headers are in", async () => {
    await navigate("/street");
    const { held, respond } = heldUntilReleased("/street/slow");
    served.set("/street/slow", respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/street/slow");
      await sleep(10);
    });
    await navigate("/street/fast");

    expect(signalOf("/street/slow")?.aborted).toBe(false);
    await act(async () => {
      held.release();
      await pending;
    });
    expect(signalOf("/street/slow")?.aborted).toBe(true);
    expect(window.location.pathname).toBe("/street/fast");
    expect(shown()).toBe("/street/fast");
  });

  test("a refresh aborts the navigation it overtakes", async () => {
    await navigate("/desk");
    const { held, respond } = heldUntilReleased("/desk/next");
    served.set("/desk/next", respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/desk/next");
      await sleep(10);
    });
    await refresh();

    await act(async () => {
      held.release();
      await pending;
    });
    expect(signalOf("/desk/next")?.aborted).toBe(true);
    expect(window.location.pathname).toBe("/desk");
  });

  test("a committed page still streaming is not cut by the navigation after it", async () => {
    const encoder = new TextEncoder();
    const rest = { send: () => {} };
    served.set(
      "/live",
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(rowOf("$L1")));
              rest.send = () => {
                controller.enqueue(encoder.encode('1:"late"\n'));
                controller.close();
              };
            },
          }),
          { headers: { "Content-Type": "text/x-component" } },
        ),
    );
    await navigate("/live");
    const { held, respond } = heldUntilReleased("/live/next");
    served.set("/live/next", respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/live/next");
      await sleep(10);
    });

    expect(signalOf("/live")?.aborted).toBe(false);
    await act(async () => {
      rest.send();
      held.release();
      await pending;
    });
    expect(shown()).toBe("/live/next");
  });

  test("a shallow push made while a navigation is loading is not overtaken by it", async () => {
    await navigate("/catalog");
    const { held, respond } = heldUntilReleased("/catalog/next");
    served.set("/catalog/next", respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/catalog/next");
      await sleep(10);
    });
    await navigate("/catalog?peek=1", { shallow: true });

    await act(async () => {
      held.release();
      await pending;
    });
    expect(signalOf("/catalog/next")?.aborted).toBe(true);

    expect(`${window.location.pathname}${window.location.search}`).toBe("/catalog?peek=1");
    expect(shown()).toBe("/catalog");
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

describe("rscClient fragment navigation", () => {
  const idxOfEntry = () => (window.history.state as { __akanRouter?: { idx?: unknown } } | null)?.__akanRouter?.idx;

  test("a fragment link keeps the page, asks the server nothing, and counts one step past the entry it left", async () => {
    await navigate("/guide");
    const idx = idxOfEntry() as number;
    const requests = fetchCountOf("/guide");

    window.history.pushState(null, "", "#install");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await act(async () => {
      await sleep(20);
    });

    expect(idxOfEntry()).toBe(idx + 1);
    expect(shown()).toBe("/guide");
    expect(fetchCountOf("/guide")).toBe(requests);

    await act(async () => window.history.back());
    await act(async () => {
      await sleep(20);
    });

    expect(window.location.hash).toBe("");
    expect(idxOfEntry()).toBe(idx);
    expect(fetchCountOf("/guide")).toBe(requests);
  });

  test("a push to another page's fragment lands on its target, not the top", async () => {
    const page = '[["$","p","p",{"children":"/manual"}],["$","h2","h",{"id":"faq","children":"FAQ"}]]';
    served.set(
      "/manual",
      () =>
        new Response(
          `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${page}}]}]]}]\n`,
          { headers: { "Content-Type": "text/x-component" } },
        ),
    );
    const scrolledTo: string[] = [];
    const scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      scrolledTo.push(this.id);
    });
    try {
      window.scrollTo(0, 500);
      await navigate("/manual#faq");

      expect(document.getElementById("faq")?.textContent).toBe("FAQ");
      expect(scrolledTo).toEqual(["faq"]);
    } finally {
      scrollIntoView.mockRestore();
    }
  });

  test("a move back from a fragment keeps the index the router stamped on the entry a document opened on", async () => {
    const asOpened = () => window.history.replaceState({ __akanRouter: { idx: 0 } }, "");
    asOpened();
    await navigate("/guide", { replace: true });
    asOpened();

    window.history.pushState(null, "", "#install");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(idxOfEntry()).toBe(1);

    await act(async () => window.history.back());
    await act(async () => {
      await sleep(20);
    });

    expect(window.location.hash).toBe("");
    expect(idxOfEntry()).toBe(0);
  });
});

describe("rscClient redirect", () => {
  test("a push the server answers with a redirect keeps the page it left one step back", async () => {
    await navigate("/porch");
    const entries = window.history.length;
    served.set("/members", preStreamRedirectTo("/door"));

    await navigate("/members");
    await waitFor(() => shown() === "/door");

    expect(window.location.pathname).toBe("/door");
    expect(window.history.length).toBe(entries + 1);
    await back("/porch");
    expect(window.location.pathname).toBe("/porch");
  });

  test("a push redirected in its stream before its page commits keeps the page it left one step back", async () => {
    await navigate("/atrium");
    const entries = window.history.length;
    served.set("/annex", redirectInFirstChunkTo("/gate"));

    await navigate("/annex");
    await waitFor(() => shown() === "/gate");

    expect(window.location.pathname).toBe("/gate");
    expect(window.history.length).toBe(entries + 1);
    await back("/atrium");
  });

  test("a redirect raised after the pushed page committed replaces that page", async () => {
    await navigate("/foyer");
    const entries = window.history.length;
    served.set("/wing", lateRedirectTo("/exit"));

    await navigate("/wing");
    await waitFor(() => shown() === "/exit");

    expect(window.history.length).toBe(entries + 1);
    await back("/foyer");
  });

  const heldPage = (text: string) => {
    let release = () => undefined as unknown;
    const respond = () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(responseOf(text));
      });
    return { respond, release: () => release() };
  };

  test("a redirect the page being left raises while the next page loads leaves that navigation alone", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/probe", leaving.serve);
    await navigate("/probe");
    const next = heldPage("/probeother");
    served.set("/probeother", next.respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/probeother");
      await sleep(10);
    });

    await act(async () => {
      leaving.release();
      await sleep(30);
    });
    await act(async () => {
      next.release();
      await pending;
    });
    served.delete("/probeother");

    expect(signalOf("/probeother")?.aborted).toBe(false);
    expect(window.location.pathname).toBe("/probeother");
    expect(shown()).toBe("/probeother");
  });

  test("a redirect the page left by Back raises while the entry it returned to loads keeps that entry", async () => {
    await navigate("/vestibule");
    const leaving = heldRedirectTo("/exit");
    served.set("/sideroom", leaving.serve);
    await navigate("/sideroom");
    await act(async () => {
      globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
    });
    const vestibule = heldPage("/vestibule");
    served.set("/vestibule", vestibule.respond);
    await act(async () => window.history.back());
    await act(async () => {
      await sleep(10);
    });

    await act(async () => {
      leaving.release();
      await sleep(30);
    });
    await act(async () => {
      vestibule.release();
      await sleep(30);
    });
    served.delete("/vestibule");

    expect(signalOf("/vestibule")?.aborted).toBe(false);
    expect(window.location.pathname).toBe("/vestibule");
    expect(shown()).toBe("/vestibule");
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

describe("rscClient prefetch", () => {
  const prefetch = async (href: string) => {
    await act(async () => {
      globalThis.__AKAN_RSC_PREFETCH__?.(href);
      await sleep(10);
    });
  };
  const later = async (ms: number, run: () => Promise<void>) => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockImplementation(() => now + ms);
    try {
      await run();
    } finally {
      clock.mockRestore();
    }
  };

  test("a page prefetched moments before the click commits as current, without asking the server again", async () => {
    await navigate("/store");
    await prefetch("/store/item");
    expect(fetched.findLast((request) => request.pathname === "/store/item")?.prefetch).toBe(true);

    await navigate("/store/item");

    expect(fetchCountOf("/store/item")).toBe(1);
    expect(shown()).toBe("/store/item");
    expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(false);
  });

  test("a page prefetched a while before the click commits as a replay its data readers refetch", async () => {
    await navigate("/shelf");
    await prefetch("/shelf/item");

    await later(6_000, () => navigate("/shelf/item"));

    expect(fetchCountOf("/shelf/item")).toBe(1);
    expect(shown()).toBe("/shelf/item");
    expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(true);
  });

  test("a page prefetched past its lifetime is asked for again", async () => {
    await navigate("/attic");
    await prefetch("/attic/item");

    await later(16_000, () => navigate("/attic/item"));

    expect(fetchCountOf("/attic/item")).toBe(2);
    expect(fetched.findLast((request) => request.pathname === "/attic/item")?.prefetch).toBe(false);
  });

  test("a prefetch the server turned away is asked for again on the click", async () => {
    await navigate("/gate");
    served.set("/gate/busy", () => new Response("Too Many Requests", { status: 429 }));
    await prefetch("/gate/busy");
    served.set("/gate/busy", () => responseOf("/gate/busy"));

    await navigate("/gate/busy");

    expect(fetchCountOf("/gate/busy")).toBe(2);
    expect(shown()).toBe("/gate/busy");
  });

  test("a page the navigation in flight is loading is not prefetched beside it", async () => {
    await navigate("/dock");
    let release = () => {};
    served.set(
      "/dock/ship",
      () => new Promise<Response>((resolve) => (release = () => resolve(responseOf("/dock/ship")))),
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/dock/ship");
      await sleep(10);
    });

    await prefetch("/dock/ship#deck");
    await act(async () => {
      release();
      await pending;
    });

    expect(fetchCountOf("/dock/ship")).toBe(1);
    expect(shown()).toBe("/dock/ship");
  });

  test("a click overtaken while it waits on its prefetch sends no request of its own", async () => {
    await navigate("/yard");
    let release = () => {};
    served.set(
      "/yard/slow",
      () => new Promise<Response>((resolve) => (release = () => resolve(responseOf("/yard/slow")))),
    );
    await prefetch("/yard/slow");
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/yard/slow");
      await sleep(10);
    });
    await navigate("/yard/fast");

    await act(async () => {
      release();
      await pending;
    });

    expect(fetchCountOf("/yard/slow")).toBe(1);
    expect(shown()).toBe("/yard/fast");
  });

  test("a prefetch of one fragment serves a click on another of the same page", async () => {
    await navigate("/manual");
    await prefetch("/manual/ch1#intro");

    await navigate("/manual/ch1#usage");

    expect(fetchCountOf("/manual/ch1")).toBe(1);
    expect(shown()).toBe("/manual/ch1");
  });

  test("a click while the prefetch is loading waits on it instead of asking twice", async () => {
    await navigate("/menu");
    let release = () => {};
    served.set(
      "/menu/dish",
      () => new Promise<Response>((resolve) => (release = () => resolve(responseOf("/menu/dish")))),
    );
    await prefetch("/menu/dish");
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/menu/dish");
      await sleep(10);
    });

    await act(async () => {
      release();
      await pending;
    });

    expect(fetchCountOf("/menu/dish")).toBe(1);
    expect(shown()).toBe("/menu/dish");
  });

  test("a page prefetched for one account is asked for again after the account changes", async () => {
    signIn("owner");
    await navigate("/hall");
    served.set("/notes", () => responseOf("owner notes"));
    await prefetch("/notes");

    signIn("visitor");
    served.set("/notes", () => responseOf("visitor notes"));
    await navigate("/notes");

    expect(fetchCountOf("/notes")).toBe(2);
    expect(shown()).toBe("visitor notes");
  });

  test("a hover after the account changes leaves the old account's page in flight uncached for the new one", async () => {
    signIn("owner");
    await navigate("/hall");
    let release = () => {};
    served.set(
      "/secret",
      () => new Promise<Response>((resolve) => (release = () => resolve(responseOf("owner secret")))),
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/secret");
      await sleep(10);
    });

    signIn("visitor");
    served.set("/elsewhere", () => responseOf("elsewhere"));
    await prefetch("/elsewhere");
    await act(async () => {
      release();
      await pending;
    });

    served.set("/secret", () => responseOf("visitor secret"));
    await navigate("/secret");

    expect(fetchCountOf("/secret")).toBe(2);
    expect(shown()).toBe("visitor secret");
  });

  test("a page prefetched before this tab's own write is asked for again on the click", async () => {
    await navigate("/cart");
    await prefetch("/cart/total");

    StaleReads.mark();
    await navigate("/cart/total");

    expect(fetchCountOf("/cart/total")).toBe(2);
    expect(fetched.findLast((request) => request.pathname === "/cart/total")?.prefetch).toBe(false);
  });

  test("a page that opts out of prefetching is asked once ahead of the click, then rendered on it", async () => {
    await navigate("/stats");
    served.set("/stats/views", () =>
      fetched.at(-1)?.prefetch ? new Response(null, { status: 204 }) : responseOf("/stats/views"),
    );
    await prefetch("/stats/views");
    await prefetch("/stats/views");

    await navigate("/stats/views");

    expect(fetched.filter((request) => request.pathname === "/stats/views").map((request) => request.prefetch)).toEqual(
      [true, false],
    );
    expect(shown()).toBe("/stats/views");
    expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(false);
  });

  test("a page the navigation cache holds under another fragment is not prefetched, and serves the click", async () => {
    await navigate("/atlas");
    await navigate("/atlas/next");

    await prefetch("/atlas#legend");
    await navigate("/atlas#legend");

    expect(fetchCountOf("/atlas")).toBe(1);
    expect(shown()).toBe("/atlas");
  });

  test("a redirect the page raises after a push to its own fragment still moves it, and is not replayed", async () => {
    const ledger = heldRedirectTo("/exit");
    served.set("/ledger", ledger.serve);
    await navigate("/ledger");
    await navigate("/ledger#total");
    expect(fetchCountOf("/ledger")).toBe(1);

    ledger.release();
    await waitFor(() => shown() === "/exit");
    expect(shown()).toBe("/exit");

    served.delete("/ledger");
    await navigate("/ledger#total");
    expect(fetchCountOf("/ledger")).toBe(2);
    expect(shown()).toBe("/ledger");
  });

  test("a cache clear on a page replayed under another fragment keeps that page for the next visit", async () => {
    served.set("/chart", () => routedResponseOf("/chart"));
    served.set("/chart/next", () => routedResponseOf("/chart/next"));
    await navigate("/chart");
    await navigate("/chart/next");
    await navigate("/chart#legend");
    expect(fetchCountOf("/chart")).toBe(1);

    await act(async () => {
      globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
    });
    await navigate("/chart/next");
    await navigate("/chart");

    expect(fetchCountOf("/chart/next")).toBe(2);
    expect(fetchCountOf("/chart")).toBe(1);
    expect(shown()).toBe("/chart");
  });

  test("a page the navigation cache holds is not prefetched", async () => {
    await navigate("/rack");
    await navigate("/rack/next");

    await prefetch("/rack");

    expect(fetchCountOf("/rack")).toBe(1);
  });

  test("a visitor saving data is sent nothing ahead of the click", async () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    try {
      await prefetch("/heavy");
    } finally {
      Reflect.deleteProperty(navigator, "connection");
    }

    expect(fetchCountOf("/heavy")).toBe(0);
  });

  test("a refresh drops what was prefetched", async () => {
    await navigate("/board");
    await prefetch("/board/2");
    await refresh();

    await navigate("/board/2");

    expect(fetchCountOf("/board/2")).toBe(2);
  });

  test("a prefetch answered with a redirect moves nothing until the click", async () => {
    await navigate("/porch2");
    served.set("/members2", preStreamRedirectTo("/door2"));
    await prefetch("/members2");
    expect(window.location.pathname).toBe("/porch2");

    await navigate("/members2");
    await waitFor(() => shown() === "/door2");

    expect(window.location.pathname).toBe("/door2");
    expect(fetchCountOf("/members2")).toBe(1);
  });
});

describe("rscClient not-found", () => {
  test("a page answered with its not-found view shows the view at the URL it was asked for", async () => {
    served.set("/vault/7", notFoundViewOf("vault missing"));
    await navigate("/vaults");
    const entries = window.history.length;

    await navigate("/vault/7");

    expect(shown()).toBe("vault missing");
    expect(window.location.pathname).toBe("/vault/7");
    expect(window.history.length).toBe(entries + 1);
  });

  test("a not-found view is asked for again, and the page after it is rendered whole", async () => {
    served.set("/shelf", () => routedResponseOf("/shelf"));
    await navigate("/shelf");
    served.set("/shelf/9", notFoundViewOf("book missing"));
    await navigate("/shelf/9");
    await navigate("/shelf/1");
    expect(sentRouterStateFor("/shelf/1")).toBe(false);

    served.set("/shelf/9", () => responseOf("book found"));
    await navigate("/shelf/9");

    expect(fetchCountOf("/shelf/9")).toBe(2);
    expect(shown()).toBe("book found");
  });

  test("a bare not-found leaves the page where it was and rejects", async () => {
    served.set("/nowhere", bareNotFound);
    await navigate("/here");
    let refusal: unknown;
    await act(async () => {
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/nowhere")?.catch((error: unknown) => {
        refusal = error;
      });
    });

    expect((refusal as Error | undefined)?.name).toBe("RscRouteNotFound");
    expect(shown()).toBe("/here");
    expect(window.location.pathname).toBe("/here");
  });

  test("a refresh answered with a not-found view shows it, while a bare one keeps the page", async () => {
    await navigate("/report");
    served.set("/report", bareNotFound);
    await refresh();
    expect(shown()).toBe("/report");

    served.set("/report", notFoundViewOf("report removed"));
    await refresh();

    expect(shown()).toBe("report removed");
    expect(window.location.pathname).toBe("/report");
  });
});

describe("rscClient dictionary", () => {
  const dictionaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-client-dict-"));
  afterAll(() => fs.rmSync(dictionaryDir, { recursive: true, force: true }));
  //? The module waits on a gate the test opens, so a commit made before the dictionary is in would show.
  const gatedDictionaryOf = (lang: string, title: string) => {
    const file = path.join(dictionaryDir, `${lang}-${title.length}.js`);
    fs.writeFileSync(
      file,
      `await globalThis.__dictGate;
export const lang = ${JSON.stringify(lang)};
export default { page: { title: { t: ${JSON.stringify(title)} } } };`,
    );
    return file;
  };
  const withDictionary = (text: string, url: string) => () =>
    new Response(rowOf(text), { headers: { "Content-Type": "text/x-component", [AKAN_RSC_DICTIONARY_HEADER]: url } });

  test("a navigation into another locale commits only once that locale's dictionary is in", async () => {
    let openGate = () => {};
    Object.assign(globalThis, { __dictGate: new Promise<void>((resolve) => (openGate = resolve)) });
    served.set("/ko/guide", withDictionary("/ko/guide", gatedDictionaryOf("ko", "안내")));
    await navigate("/en/guide");

    let navigation: Promise<void> | undefined;
    await act(async () => {
      navigation = globalThis.__AKAN_RSC_NAVIGATE__?.("/ko/guide");
      await sleep(30);
    });
    expect(shown()).toBe("/en/guide");
    expect(Translator.hasLocale("ko")).toBe(false);

    await act(async () => {
      openGate();
      await navigation;
    });
    expect(Translator.translateByLocale("ko", "page.title")).toBe("안내");
    expect(shown()).toBe("/ko/guide");
  });

  test("a refresh after a dictionary edit takes the new build's text", async () => {
    Object.assign(globalThis, { __dictGate: Promise.resolve() });
    served.set("/ko/notice", withDictionary("/ko/notice", gatedDictionaryOf("ko", "공지 사항")));
    await navigate("/ko/notice");
    served.set("/ko/notice", withDictionary("/ko/notice", gatedDictionaryOf("ko", "새 공지 사항입니다")));

    await refresh();

    expect(Translator.translateByLocale("ko", "page.title")).toBe("새 공지 사항입니다");
  });
});
