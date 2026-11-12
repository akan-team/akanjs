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
  AKAN_RSC_CURRENT_STATE_HEADER,
  AKAN_RSC_DICTIONARY_HEADER,
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PATCH_HEAD_SAFE_HEADER,
  AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_PREFETCH_HEADER,
  AKAN_RSC_RESPONSE_STATE_HEADER,
  type AkanRouterStateV1,
  decodeAkanRouterState,
  encodeAkanHeadSnapshot,
  encodeAkanRouterState,
  encodeAkanRscPatchSegmentPath,
} from "./routeState";
import * as outletModule from "./rscSegmentOutlet";

const origin = "http://localhost";
const OUTLET_MODULE_ID = "akan-outlet";
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
const served = new Map<string, (headers: Headers) => Response | Promise<Response>>();
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
    __webpack_require__: Object.assign((id: string) => (id === OUTLET_MODULE_ID ? outletModule : {}), { u: () => "" }),
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
      const response = served.get(target.pathname)?.(headers) ?? responseOf(`${target.pathname}${target.search}`);
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

  const heldNotFound = () => {
    let release = () => undefined as unknown;
    const respond = () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(bareNotFound());
      });
    return { respond, release: () => release() };
  };

  test("a redirect the page on screen raises while the next navigation loads runs once that one is refused as a bare 404", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/probe2", leaving.serve);
    await navigate("/probe2");
    const entries = window.history.length;
    const refused = heldNotFound();
    served.set("/nowhere2", refused.respond);
    let refusal: unknown;
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.("/nowhere2")?.catch((error: unknown) => {
        refusal = error;
      });
      await sleep(10);
    });
    await act(async () => {
      leaving.release();
      await sleep(30);
    });
    expect(window.location.pathname).toBe("/probe2");

    await act(async () => {
      refused.release();
      await pending;
    });
    await waitFor(() => shown() === "/exit");
    served.delete("/nowhere2");

    expect((refusal as Error | undefined)?.name).toBe("RscRouteNotFound");
    expect(window.location.pathname).toBe("/exit");
    expect(window.history.length).toBe(entries);
  });

  test("a redirect the page on screen raises while its refresh loads runs once the refresh finds no page", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/lantern", leaving.serve);
    await navigate("/lantern");
    const refused = heldNotFound();
    served.set("/lantern", refused.respond);
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_REFRESH__?.();
      await sleep(10);
    });
    await act(async () => {
      leaving.release();
      await sleep(30);
    });
    expect(window.location.pathname).toBe("/lantern");

    await act(async () => {
      refused.release();
      await pending;
    });
    await waitFor(() => shown() === "/exit");
    served.delete("/lantern");

    expect(window.location.pathname).toBe("/exit");
  });

  const startNavigation = async (href: string) => {
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = globalThis.__AKAN_RSC_NAVIGATE__?.(href)?.catch(() => undefined);
      await sleep(10);
    });
    return () => pending;
  };

  test("a parked redirect runs on a bare 404 after a shallow change of the page's query", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/terrace", leaving.serve);
    await navigate("/terrace");
    await navigate("/terrace?tab=2", { shallow: true });
    const refused = heldNotFound();
    served.set("/nowhere3", refused.respond);
    const pending = await startNavigation("/nowhere3");
    await act(async () => {
      leaving.release();
      await sleep(30);
    });

    await act(async () => {
      refused.release();
      await pending();
    });
    await waitFor(() => shown() === "/exit");
    served.delete("/nowhere3");

    expect(window.location.pathname).toBe("/exit");
  });

  test("a parked redirect runs once a shallow change cancels the navigation it waited for", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/balcony", leaving.serve);
    await navigate("/balcony");
    const refused = heldNotFound();
    served.set("/nowhere4", refused.respond);
    const pending = await startNavigation("/nowhere4");
    await act(async () => {
      leaving.release();
      await sleep(30);
    });

    await navigate("/balcony?tab=3", { shallow: true });
    await waitFor(() => shown() === "/exit");
    await act(async () => {
      refused.release();
      await pending();
    });
    served.delete("/nowhere4");

    expect(window.location.pathname).toBe("/exit");
  });

  test("a parked redirect runs once Back between the page's shallow entries cancels the navigation it waited for", async () => {
    const leaving = heldRedirectTo("/exit");
    served.set("/atelier", leaving.serve);
    await navigate("/atelier");
    await navigate("/atelier?tab=1", { shallow: true });
    const refused = heldNotFound();
    served.set("/nowhere5", refused.respond);
    const pending = await startNavigation("/nowhere5");
    await act(async () => {
      leaving.release();
      await sleep(30);
    });

    await back("/exit");
    await act(async () => {
      refused.release();
      await pending();
    });
    served.delete("/nowhere5");

    expect(window.location.pathname).toBe("/exit");
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

  test("without partial commit a prefetch names no page and stays held across a full navigation", async () => {
    for (const pathname of ["/foff/a", "/foff/b", "/foff/c"]) served.set(pathname, () => routedResponseOf(pathname));
    await navigate("/foff/a");
    await prefetch("/foff/b");
    await navigate("/foff/c");
    await prefetch("/foff/b");

    await navigate("/foff/b");

    const prefetches = fetched.filter((request) => request.pathname === "/foff/b" && request.prefetch);
    expect(prefetches.map((request) => request.sentRouterState)).toEqual([false]);
    expect(fetchCountOf("/foff/b")).toBe(1);
    expect(shown()).toBe("/foff/b");
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

describe("rscClient route head key", () => {
  test("a navigation names the layouts head of the page it leaves from, never one still mounted before it", async () => {
    const keyed = (response: Response, headKey: string) => {
      const state = decodeAkanRouterState(response.headers.get(AKAN_RSC_RESPONSE_STATE_HEADER));
      if (state) response.headers.set(AKAN_RSC_RESPONSE_STATE_HEADER, encodeAkanRouterState({ ...state, headKey }));
      return response;
    };
    const sent = new Map<string, AkanRouterStateV1 | null>();
    const fetchOf = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const target = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      sent.set(target.pathname, decodeAkanRouterState(new Headers(init?.headers).get(AKAN_RSC_CURRENT_STATE_HEADER)));
      return fetchOf(input, init);
    }) as typeof fetch;
    served.set("/atlas", () => keyed(routedResponseOf("/atlas"), "atlas layouts"));
    served.set("/atlas/map", () => routedResponseOf("/atlas/map"));
    const enabled = process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
    process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "1";
    try {
      await navigate("/atlas");
      await navigate("/atlas/map");
      await navigate("/atlas/legend");
    } finally {
      globalThis.fetch = fetchOf;
      if (enabled === undefined) delete process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
      else process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = enabled;
    }

    expect(sent.get("/atlas/map")).toMatchObject({ routeId: "/atlas", headKey: "atlas layouts" });
    expect(sent.get("/atlas/legend")).toMatchObject({ routeId: "/atlas/map" });
    expect(sent.get("/atlas/legend")?.headKey).toBeUndefined();
  });
});

describe("rscClient patch cache", () => {
  const enabled = process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
  beforeAll(() => {
    process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "1";
  });
  afterAll(() => {
    if (enabled === undefined) delete process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
    else process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = enabled;
  });
  const frameShown = () => document.querySelector("nav")?.textContent;
  const stateOf = (pathname: string, headKey: string, layouts: string[] = []): AkanRouterStateV1 => ({
    version: 1,
    href: `${origin}${pathname}`,
    routeId: pathname,
    segments: [
      { key: "root", path: "/", kind: "root-layout" },
      ...layouts.map((layout) => ({ key: `layout:${layout}`, path: layout, kind: "layout" as const })),
      { key: `page:${pathname}`, path: pathname, kind: "page" },
    ],
    headKey,
  });
  const flight = (value: unknown) => `0:${JSON.stringify(value)}\n`;
  const wholeResponseOf = (pathname: string, frame: string, state: AkanRouterStateV1, page: unknown = pathname) => {
    const head = {
      layouts: { version: 1, nodes: [] },
      page: { version: 1, nodes: [{ tag: "title", text: pathname }] },
    };
    const outlet = ["$", "$L1", null, { segmentKey: "slot:root:1", children: page }];
    const body = {
      children: [
        ["$", "nav", "n", { children: frame }],
        ["$", "main", "m", { children: outlet }],
      ],
    };
    const html = {
      children: [
        ["$", "head", "h", { children: ["$", "$L2", null, head] }],
        ["$", "body", "b", body],
      ],
    };
    const rows = `1:I${JSON.stringify([OUTLET_MODULE_ID, [], "AkanSegmentOutlet"])}\n2:I${JSON.stringify([OUTLET_MODULE_ID, [], "AkanRouteHead"])}\n${flight(["$", "html", null, html])}`;
    return new Response(rows, {
      headers: { "Content-Type": "text/x-component", [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(state) },
    });
  };
  const patchResponseOf = (pathname: string, state: AkanRouterStateV1) =>
    new Response(flight(`${pathname} patched`), {
      headers: {
        "Content-Type": "text/x-component",
        "X-Akan-Rsc-Partial": "patch",
        [AKAN_RSC_PATCH_START_INDEX_HEADER]: String(state.segments.length - 1),
        [AKAN_RSC_PATCH_START_SEGMENT_HEADER]: `page:${pathname}`,
        [AKAN_RSC_PATCH_SEGMENT_PATH_HEADER]: encodeAkanRscPatchSegmentPath(state.segments.map(({ key }) => key)),
        [AKAN_RSC_PATCH_HEAD_SAFE_HEADER]: "1",
        [AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER]:
          encodeAkanHeadSnapshot({ version: 1, nodes: [{ tag: "title", text: `${pathname} patched` }] }) ?? "",
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(state),
      },
    });
  //? The worker's planner in small: a patch only from a page of the same frame (route group, locale) and layouts head.
  const frames = new Map<string, { frame: string; headKey: string }>();
  const framed = (pathname: string, frame: string, headKey = `${frame} layouts`) => {
    frames.set(pathname, { frame, headKey });
    served.set(pathname, (headers) => {
      const from = decodeAkanRouterState(headers.get(AKAN_RSC_CURRENT_STATE_HEADER));
      const target = frames.get(pathname) ?? { frame, headKey };
      const state = stateOf(pathname, target.headKey);
      const fromFrame = from ? frames.get(new URL(from.href, origin).pathname)?.frame : undefined;
      return fromFrame === target.frame && from?.headKey === target.headKey
        ? patchResponseOf(pathname, state)
        : wholeResponseOf(pathname, target.frame, state);
    });
  };

  test("a navigation's stream and a patch's each go through one Flight row pass", async () => {
    framed("/pass/a", "pass");
    framed("/pass/b", "pass");
    const passesOf = async (href: string) => {
      let passes = 0;
      Object.assign(globalThis, {
        TransformStream: class extends TransformStream {
          constructor(...args: ConstructorParameters<typeof TransformStream>) {
            super(...args);
            passes += 1;
          }
        },
      });
      try {
        await navigate(href);
      } finally {
        Object.assign(globalThis, { TransformStream });
      }
      return passes;
    };

    expect(await passesOf("/pass/a")).toBe(1);
    expect(shown()).toBe("/pass/a");
    expect(await passesOf("/pass/b")).toBe(1);
    expect(shown()).toBe("/pass/b patched");
  });

  test.each([
    ["a redirect", "redirect", { digest: "AKAN_REDIRECT;push;307;%2Flogin", name: "Error" }],
    ["an error", "error", { digest: "AKAN_RENDER_ERROR", name: "Error", message: "Boom" }],
  ])("a patch whose stream carries %s row is fetched again whole, not laid", async (_, kind, error) => {
    const base = `/ctl-${kind}`;
    framed(`${base}/a`, base);
    framed(`${base}/b`, base);
    const framedB = served.get(`${base}/b`);
    served.set(`${base}/b`, async (headers) => {
      const response = (await framedB?.(headers)) ?? responseOf(base);
      if (response.headers.get("X-Akan-Rsc-Partial") !== "patch") return response;
      return new Response(`${await response.text()}1:E${JSON.stringify(error)}\n`, { headers: response.headers });
    });
    await navigate(`${base}/a`);

    await navigate(`${base}/b`);

    const requests = fetched.filter(({ pathname }) => pathname === `${base}/b`);
    expect(requests.map(({ sentRouterState }) => sentRouterState)).toEqual([true, false]);
    expect(shown()).toBe(`${base}/b`);
  });

  test("a patch whose redirect row comes while its dictionary loads is fetched again whole, not laid", async () => {
    const dictionaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-patch-dict-"));
    const dictionary = path.join(dictionaryDir, "fr.js");
    fs.writeFileSync(dictionary, 'await globalThis.__patchDictGate;\nexport const lang = "fr";\nexport default {};');
    let openDictionary = () => {};
    Object.assign(globalThis, { __patchDictGate: new Promise<void>((resolve) => (openDictionary = resolve)) });
    let sendRedirect = () => {};
    framed("/held/a", "held");
    framed("/held/b", "held");
    const framedB = served.get("/held/b");
    served.set("/held/b", async (headers) => {
      const response = (await framedB?.(headers)) ?? responseOf("/held");
      if (response.headers.get("X-Akan-Rsc-Partial") !== "patch") return response;
      const encoder = new TextEncoder();
      const [root, redirect] = [await response.text(), '1:E{"digest":"AKAN_REDIRECT;push;307;%2Flogin"}\n'];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(root));
          sendRedirect = () => {
            controller.enqueue(encoder.encode(redirect));
            controller.close();
          };
        },
      });
      response.headers.set(AKAN_RSC_DICTIONARY_HEADER, dictionary);
      return new Response(body, { headers: response.headers });
    });
    await navigate("/held/a");
    let navigation: Promise<void> | undefined;
    await act(async () => {
      navigation = globalThis.__AKAN_RSC_NAVIGATE__?.("/held/b");
      await sleep(30);
    });
    expect(shown()).toBe("/held/a");

    await act(async () => {
      sendRedirect();
      await sleep(10);
      openDictionary();
      await navigation;
    });

    fs.rmSync(dictionaryDir, { recursive: true, force: true });
    const requests = fetched.filter(({ pathname }) => pathname === "/held/b");
    expect(requests.map(({ sentRouterState }) => sentRouterState)).toEqual([true, false]);
    expect(shown()).toBe("/held/b");
  });

  test("a patch is replayed once a full commit brings back the page it went under, with its own title", async () => {
    framed("/deck/a", "deck");
    framed("/deck/b", "deck");
    framed("/stage", "stage");
    await navigate("/deck/a");
    await navigate("/deck/b");
    expect(shown()).toBe("/deck/b patched");

    await navigate("/stage");
    await navigate("/deck/a");
    expect(document.title).toBe("/deck/a");
    await navigate("/deck/b");

    expect(fetchCountOf("/deck/b")).toBe(1);
    expect(fetchCountOf("/deck/a")).toBe(1);
    expect(shown()).toBe("/deck/b patched");
    expect(frameShown()).toBe("deck");
    expect(document.title).toBe("/deck/b patched");
    expect(document.head.querySelectorAll("title").length).toBe(1);
    expect(window.location.pathname).toBe("/deck/b");
    expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(true);
  });

  test("a patch cached under one fragment of a page is replayed for another fragment of it", async () => {
    framed("/sec/a", "sec");
    framed("/sec/b", "sec");
    framed("/sec-off", "secoff");
    await navigate("/sec/a");
    await navigate("/sec/b#one");
    expect(shown()).toBe("/sec/b patched");
    await navigate("/sec-off");
    await navigate("/sec/a");

    await navigate("/sec/b#two");

    expect(fetchCountOf("/sec/b")).toBe(1);
    expect(shown()).toBe("/sec/b patched");
    expect(document.title).toBe("/sec/b patched");
    expect(window.location.hash).toBe("#two");
    expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(true);
  });

  const lateRow = (digest: string) => ({
    digest,
    name: "Error",
    message: "late",
    stack: [],
    env: "Server",
    owner: null,
  });
  const servedWithLateRows = (base: string, rows: object[], whole?: () => Response) => {
    let release = () => {};
    framed(`/${base}/a`, base);
    framed(`/${base}/off`, `${base}off`);
    served.set(`/${base}/b`, (headers) => {
      const state = stateOf(`/${base}/b`, `${base} layouts`);
      if (!headers.has(AKAN_RSC_CURRENT_ROUTE_HEADER)) return whole?.() ?? wholeResponseOf(`/${base}/b`, base, state);
      if (fetchCountOf(`/${base}/b`) > 1) return patchResponseOf(`/${base}/b`, state);
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(flight(`/${base}/b patched`)));
          await new Promise<void>((resolve) => (release = resolve));
          controller.enqueue(encoder.encode(rows.map((row, i) => `${i + 1}:E${JSON.stringify(row)}\n`).join("")));
          controller.close();
        },
      });
      return new Response(body, { headers: patchResponseOf(`/${base}/b`, state).headers });
    });
    return () => release();
  };
  const requestsOf = (pathname: string) =>
    fetched.filter((request) => request.pathname === pathname).map(({ sentRouterState }) => sentRouterState);

  test("a redirect a patch's stream carries after it was laid is followed, through the whole page's render", async () => {
    const redirect = lateRow("AKAN_REDIRECT;replace;307;%2Flrd%2Flogin");
    const release = servedWithLateRows("lrd", [redirect], preStreamRedirectTo("/lrd/login"));
    await navigate("/lrd/a");
    await navigate("/lrd/b");
    expect(shown()).toBe("/lrd/b patched");

    await act(async () => release());
    await waitFor(() => shown() === "/lrd/login");

    expect(window.location.pathname).toBe("/lrd/login");
    expect(requestsOf("/lrd/b")).toEqual([true, false]);
  });

  test("errors a patch's stream carries after it was laid load the whole page once", async () => {
    const release = servedWithLateRows("ler", [lateRow("5c6d7e8f"), lateRow("6d7e8f90")]);
    await navigate("/ler/a");
    await navigate("/ler/b");
    expect(shown()).toBe("/ler/b patched");

    await act(async () => release());
    await waitFor(() => shown() === "/ler/b");

    expect(window.location.pathname).toBe("/ler/b");
    expect(requestsOf("/ler/b")).toEqual([true, false]);
  });

  test("a redirect a patch's stream carries after a shallow change of its query is still followed", async () => {
    const redirect = lateRow("AKAN_REDIRECT;replace;307;%2Flsh%2Flogin");
    const release = servedWithLateRows("lsh", [redirect], preStreamRedirectTo("/lsh/login"));
    await navigate("/lsh/a");
    await navigate("/lsh/b");
    await navigate("/lsh/b?tab=2", { shallow: true });

    await act(async () => release());
    await waitFor(() => shown() === "/lsh/login");

    expect(window.location.pathname).toBe("/lsh/login");
    expect(requestsOf("/lsh/b")).toEqual([true, false]);
  });

  test("a redirect a patch's stream carries after it was laid moves nothing while a document load takes over", async () => {
    const redirect = lateRow("AKAN_REDIRECT;replace;307;%2Fldf%2Flogin");
    const release = servedWithLateRows("ldf", [redirect], preStreamRedirectTo("/ldf/login"));
    served.set("/ldf/broken", () => new Response("down", { status: 500 }));
    const assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await navigate("/ldf/a");
      await navigate("/ldf/b");
      await navigate("/ldf/broken");
      expect(assign).toHaveBeenCalledWith(`${origin}/ldf/broken`);

      await act(async () => {
        release();
        await sleep(10);
      });

      expect(requestsOf("/ldf/b")).toEqual([true]);
      expect(window.location.pathname).toBe("/ldf/b");
    } finally {
      assign.mockRestore();
      warn.mockRestore();
    }
  });

  test("React's dev-only error row a patch's stream carries after it was laid reloads nothing", async () => {
    const release = servedWithLateRows("ldb", [lateRow("")]);
    await navigate("/ldb/a");
    await navigate("/ldb/b");

    await act(async () => {
      release();
      await sleep(10);
    });

    expect(requestsOf("/ldb/b")).toEqual([true]);
    expect(shown()).toBe("/ldb/b patched");
  });

  test("a redirect a replayed patch's stream carries after it was laid again is followed", async () => {
    const redirect = lateRow("AKAN_REDIRECT;replace;307;%2Flrp%2Flogin");
    const release = servedWithLateRows("lrp", [redirect], preStreamRedirectTo("/lrp/login"));
    await navigate("/lrp/a");
    await navigate("/lrp/b");
    await navigate("/lrp/off");
    await navigate("/lrp/a");
    await navigate("/lrp/b");
    expect(requestsOf("/lrp/b")).toEqual([true]);

    await act(async () => release());
    await waitFor(() => shown() === "/lrp/login");

    expect(window.location.pathname).toBe("/lrp/login");
  });

  test.each([
    ["a server error", "lse", "5c6d7e8f"],
    ["a redirect", "lsr", "AKAN_REDIRECT;replace;307;%2Flogin"],
  ])(
    "a patch whose stream carried %s after a newer page replaced it moves nothing, and is not replayed",
    async (_, base, digest) => {
      const release = servedWithLateRows(base, [lateRow(digest)]);
      await navigate(`/${base}/a`);
      await navigate(`/${base}/b`);
      await navigate(`/${base}/off`);

      await act(async () => {
        release();
        await sleep(10);
      });
      expect(window.location.pathname).toBe(`/${base}/off`);
      expect(fetchCountOf(`/${base}/off`)).toBe(1);
      await navigate(`/${base}/a`);
      await navigate(`/${base}/b`);

      expect(requestsOf(`/${base}/b`)).toEqual([true, true]);
      expect(shown()).toBe(`/${base}/b patched`);
    },
  );

  test("a patch laid on a patch is replayed straight under its base, and the next request names it", async () => {
    framed("/ch/a", "ch");
    framed("/ch/b", "ch");
    framed("/ch/c", "ch");
    framed("/ch/d", "ch");
    framed("/cho", "cho");
    await navigate("/ch/a");
    await navigate("/ch/b");
    await navigate("/ch/c");
    await navigate("/cho");
    await navigate("/ch/a");
    await navigate("/ch/c");
    expect(fetchCountOf("/ch/c")).toBe(1);
    expect(shown()).toBe("/ch/c patched");
    expect(frameShown()).toBe("ch");
    let sentFrom: AkanRouterStateV1 | null = null;
    const inner = served.get("/ch/d");
    served.set("/ch/d", (headers) => {
      sentFrom = decodeAkanRouterState(headers.get(AKAN_RSC_CURRENT_STATE_HEADER));
      return inner?.(headers) ?? responseOf("x");
    });

    await navigate("/ch/d");

    expect((sentFrom as AkanRouterStateV1 | null)?.href).toBe(`${origin}/ch/c`);
    expect((sentFrom as AkanRouterStateV1 | null)?.headKey).toBe("ch layouts");
    expect(shown()).toBe("/ch/d patched");
    expect(document.head.querySelectorAll("title").length).toBe(1);
  });

  test("a not-found view in between keeps the patches of the page before it", async () => {
    framed("/shed/a", "shed");
    framed("/shed/b", "shed");
    served.set("/shed/gone", notFoundViewOf("shed missing"));
    await navigate("/shed/a");
    await navigate("/shed/b");
    await navigate("/shed/gone");
    expect(shown()).toBe("shed missing");

    await navigate("/shed/a");
    await navigate("/shed/b");

    expect(fetchCountOf("/shed/b")).toBe(1);
    expect(shown()).toBe("/shed/b patched");
  });

  test.each([
    ["route group", "/account/login", "/account/signup", "guest", "/account/settings", "member"],
    ["locale", "/en/guide/a", "/en/guide/b", "en", "/ko/guide/a", "ko"],
  ])(
    "a patch is never laid under another %s's layouts at the same segment keys",
    async (_, base, sibling, frame, other, otherFrame) => {
      framed(base, frame);
      framed(sibling, frame);
      framed(other, otherFrame);
      await navigate(base);
      await navigate(sibling);
      await navigate(other);
      expect(frameShown()).toBe(otherFrame);
      await navigate(base);
      await navigate(sibling);
      expect(fetchCountOf(sibling)).toBe(1);

      await navigate(other);
      await navigate(sibling);

      expect(fetchCountOf(sibling)).toBe(2);
      expect(shown()).toBe(sibling);
      expect(frameShown()).toBe(frame);
      expect(document.title).toBe(sibling);
    },
  );

  test("a page rendered again with other layouts after it left the full cache takes none of the patches laid under it", async () => {
    framed("/hall/a", "hall", "hall v1");
    framed("/hall/b", "hall", "hall v1");
    framed("/porch", "porch");
    await navigate("/hall/a");
    await navigate("/hall/b");
    await navigate("/porch");
    await navigate("/hall/a");
    await navigate("/hall/b");
    expect(fetchCountOf("/hall/b")).toBe(1);

    for (let index = 0; index < 32; index += 1) await navigate(`/corridor/${index}`);
    framed("/hall/a", "hall", "hall v2");
    framed("/hall/b", "hall", "hall v2");
    await navigate("/hall/a");
    expect(fetchCountOf("/hall/a")).toBe(2);
    await navigate("/hall/b");

    expect(fetchCountOf("/hall/b")).toBe(2);
    expect(sentRouterStateFor("/hall/b")).toBe(true);
    expect(shown()).toBe("/hall/b patched");
  });

  test("an HMR refresh drops the patches cached before it", async () => {
    framed("/loft/a", "loft");
    framed("/loft/b", "loft");
    framed("/roof", "roof");
    await navigate("/loft/a");
    await navigate("/loft/b");
    await navigate("/roof");
    await navigate("/loft/a");
    await navigate("/loft/b");
    expect(fetchCountOf("/loft/b")).toBe(1);
    await navigate("/roof");

    await act(async () => {
      globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
      await globalThis.__AKAN_RSC_REFRESH__?.({ buildId: 4 });
    });
    await navigate("/loft/a");
    await navigate("/loft/b");

    expect(fetchCountOf("/loft/a")).toBe(2);
    expect(fetchCountOf("/loft/b")).toBe(2);
    expect(shown()).toBe("/loft/b patched");
  });

  test("clearing the navigation cache with the base on screen drops the patches laid under it", async () => {
    framed("/p1/a", "p1");
    framed("/p1/b", "p1");
    framed("/p1o", "p1o");
    await navigate("/p1/a");
    await navigate("/p1/b");
    await navigate("/p1o");
    await navigate("/p1/a");

    await act(async () => {
      globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
    });
    await navigate("/p1/b");

    expect(fetchCountOf("/p1/b")).toBe(2);
  });

  test("a patch reached through a redirect is replayed for the page it landed on, and the redirect asked again", async () => {
    framed("/mill/a", "mill");
    framed("/mill/new", "mill");
    framed("/yard", "yard");
    served.set("/mill/old", preStreamRedirectTo("/mill/new"));
    await navigate("/mill/a");
    await navigate("/mill/old");
    await waitFor(() => window.location.pathname === "/mill/new");
    expect(shown()).toBe("/mill/new patched");
    await navigate("/yard");
    await navigate("/mill/a");

    await navigate("/mill/old");
    await waitFor(() => window.location.pathname === "/mill/new");

    expect(fetchCountOf("/mill/old")).toBe(2);
    expect(fetchCountOf("/mill/new")).toBe(1);
    expect(shown()).toBe("/mill/new patched");
    expect(document.title).toBe("/mill/new patched");
  });

  test("a page the server now redirects is asked again, never replayed from the patch it had", async () => {
    framed("/rv/a", "rv");
    framed("/rv/b", "rv");
    framed("/rvo", "rvo");
    framed("/rv/login", "rvo");
    await navigate("/rv/a");
    await navigate("/rv/b");
    await navigate("/rvo");
    served.set("/rv/b", preStreamRedirectTo("/rv/login"));
    await navigate("/rv/b");
    await waitFor(() => window.location.pathname === "/rv/login");
    await navigate("/rv/a");

    await navigate("/rv/b");

    expect(fetchCountOf("/rv/b")).toBe(3);
  });

  test("a page the server now answers not-found is asked again, never replayed from the patch it had", async () => {
    framed("/nf/a", "nf");
    framed("/nf/b", "nf");
    framed("/nfo", "nfo");
    await navigate("/nf/a");
    await navigate("/nf/b");
    await navigate("/nfo");
    served.set("/nf/b", notFoundViewOf("nf gone"));
    await navigate("/nf/b");
    await navigate("/nf/a");

    await navigate("/nf/b");

    expect(fetchCountOf("/nf/b")).toBe(3);
    expect(shown()).toBe("nf gone");
  });

  test("a page committed without router state names none for the next request, which renders whole at once", async () => {
    framed("/bare/a", "bare");
    framed("/bare/b", "bare");
    served.set("/plain", () => responseOf("plain"));
    await navigate("/bare/a");
    await navigate("/plain");

    await navigate("/bare/b");

    expect(fetchCountOf("/bare/b")).toBe(1);
    expect(sentRouterStateFor("/bare/b")).toBe(false);
    expect(shown()).toBe("/bare/b");
    expect(frameShown()).toBe("bare");
  });

  describe("with a prefetch", () => {
    const prefetch = async (href: string) => {
      await act(async () => {
        globalThis.__AKAN_RSC_PREFETCH__?.(href);
        await sleep(10);
      });
    };
    const prefetchCountOf = (pathname: string) =>
      fetched.filter((request) => request.pathname === pathname && request.prefetch).length;
    const navigationCountOf = (pathname: string) =>
      fetched.filter((request) => request.pathname === pathname && !request.prefetch).length;

    test("a sibling prefetched under the page on screen commits as a patch, asking nothing more", async () => {
      framed("/den/a", "den");
      framed("/den/b", "den");
      await navigate("/den/a");
      await prefetch("/den/b");

      await navigate("/den/b");

      expect(prefetchCountOf("/den/b")).toBe(1);
      expect(navigationCountOf("/den/b")).toBe(0);
      expect(shown()).toBe("/den/b patched");
      expect(frameShown()).toBe("den");
      expect(document.title).toBe("/den/b patched");
      expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(false);
    });

    test("a sibling prefetched a while before the click commits as a replay its data readers refetch", async () => {
      framed("/frs/a", "frs");
      framed("/frs/b", "frs");
      await navigate("/frs/a");
      await prefetch("/frs/b");

      const now = Date.now();
      const clock = spyOn(Date, "now").mockImplementation(() => now + 6_000);
      try {
        await navigate("/frs/b");
      } finally {
        clock.mockRestore();
      }

      expect(navigationCountOf("/frs/b")).toBe(0);
      expect(shown()).toBe("/frs/b patched");
      expect(globalThis.__AKAN_RSC_IS_FROM_CACHE__?.()).toBe(true);
    });

    test("a prefetched patch is never laid under the page a full navigation put on screen since", async () => {
      framed("/inn/en/a", "en");
      framed("/inn/en/b", "en");
      framed("/inn/ko/a", "ko");
      await navigate("/inn/en/a");
      await prefetch("/inn/en/b");
      await navigate("/inn/ko/a");

      await navigate("/inn/en/b");

      expect(navigationCountOf("/inn/en/b")).toBe(1);
      expect(shown()).toBe("/inn/en/b");
      expect(frameShown()).toBe("en");
    });

    test("a whole page prefetched before a full navigation is still taken by the click", async () => {
      framed("/hw/a", "hw");
      framed("/hw/b", "hwb");
      framed("/hw/x", "hwx");
      await navigate("/hw/a");
      await prefetch("/hw/b");
      await navigate("/hw/x");

      await navigate("/hw/b");

      expect(prefetchCountOf("/hw/b")).toBe(1);
      expect(navigationCountOf("/hw/b")).toBe(0);
      expect(shown()).toBe("/hw/b");
      expect(frameShown()).toBe("hwb");
    });

    test("a patch still loading when a full navigation changes the page under it is cut, and the click asks again", async () => {
      framed("/fl/a", "fl");
      framed("/fl/x", "flx");
      frames.set("/fl/b", { frame: "fl", headKey: "fl layouts" });
      let release = () => {};
      served.set("/fl/b", (headers) => {
        const state = stateOf("/fl/b", "fl layouts");
        if (headers.get(AKAN_RSC_PREFETCH_HEADER) !== "1") return wholeResponseOf("/fl/b", "fl", state);
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode(flight("/fl/b patched")));
            await new Promise<void>((resolve) => (release = resolve));
            controller.close();
          },
        });
        return new Response(body, { headers: patchResponseOf("/fl/b", state).headers });
      });
      await navigate("/fl/a");
      await prefetch("/fl/b");
      await navigate("/fl/x");

      await navigate("/fl/b");

      const prefetchSignal = fetched.find((request) => request.pathname === "/fl/b" && request.prefetch)?.signal;
      expect(prefetchSignal?.aborted).toBe(true);
      expect(navigationCountOf("/fl/b")).toBe(1);
      expect(shown()).toBe("/fl/b");
      release();
    });

    test("a sibling prefetched again after a full navigation is asked for under the page now on screen", async () => {
      framed("/pub/a", "pub");
      framed("/pub/b", "pub");
      framed("/pier", "pier");
      await navigate("/pub/a");
      await prefetch("/pub/b");
      await navigate("/pier");
      await prefetch("/pub/b");

      await navigate("/pub/b");

      expect(prefetchCountOf("/pub/b")).toBe(2);
      expect(navigationCountOf("/pub/b")).toBe(0);
      expect(shown()).toBe("/pub/b");
      expect(frameShown()).toBe("pub");
    });

    test("a page the patch cache would replay is not prefetched", async () => {
      framed("/cab/a", "cab");
      framed("/cab/b", "cab");
      framed("/lot", "lot");
      await navigate("/cab/a");
      await navigate("/cab/b");
      await navigate("/lot");
      await navigate("/cab/a");
      await prefetch("/cab/b");

      await navigate("/cab/b");

      expect(prefetchCountOf("/cab/b")).toBe(0);
      expect(navigationCountOf("/cab/b")).toBe(1);
      expect(shown()).toBe("/cab/b patched");
    });

    test("a page whose patch was cached under another fragment is not prefetched", async () => {
      framed("/frg/a", "frg");
      framed("/frg/b", "frg");
      framed("/frg-off", "frgoff");
      await navigate("/frg/a");
      await navigate("/frg/b#one");
      await navigate("/frg-off");
      await navigate("/frg/a");

      await prefetch("/frg/b#two");

      expect(prefetchCountOf("/frg/b")).toBe(0);
    });

    test("a page that opts out of prefetching is asked once, not again under each page put on screen", async () => {
      framed("/opt/a", "opt");
      framed("/opt/x", "optx");
      served.set("/opt/stats", (headers) =>
        headers.get(AKAN_RSC_PREFETCH_HEADER) === "1"
          ? new Response(null, { status: 204 })
          : wholeResponseOf("/opt/stats", "opt", stateOf("/opt/stats", "opt layouts")),
      );
      await navigate("/opt/a");
      await prefetch("/opt/stats");
      await navigate("/opt/x");
      await prefetch("/opt/stats");

      await navigate("/opt/stats");

      expect(prefetchCountOf("/opt/stats")).toBe(1);
      expect(navigationCountOf("/opt/stats")).toBe(1);
      expect(shown()).toBe("/opt/stats");
    });

    test("a page whose cached patch went under another full commit is still prefetched", async () => {
      framed("/oth/a", "oth");
      framed("/oth/b", "oth");
      framed("/oth/x", "othx");
      await navigate("/oth/a");
      await navigate("/oth/b");
      await navigate("/oth/x");

      await prefetch("/oth/b");

      expect(prefetchCountOf("/oth/b")).toBe(1);
    });

    test("a page whose cached patch keeps a layout the page on screen lacks is still prefetched", async () => {
      const deep = (pathname: string) => stateOf(pathname, "gd layouts", ["/gd"]);
      const nested = (pathname: string) => ["$", "$L1", null, { segmentKey: "slot:layout:/gd:2", children: pathname }];
      const fromGuide = (headers: Headers) =>
        decodeAkanRouterState(headers.get(AKAN_RSC_CURRENT_STATE_HEADER))?.segments[1]?.key === "layout:/gd";
      served.set("/gd/x", () => wholeResponseOf("/gd/x", "gd", deep("/gd/x"), nested("/gd/x")));
      served.set("/gd/y", (headers) =>
        fromGuide(headers)
          ? patchResponseOf("/gd/y", deep("/gd/y"))
          : wholeResponseOf("/gd/y", "gd", deep("/gd/y"), nested("/gd/y")),
      );
      served.set("/gd-other", () => patchResponseOf("/gd-other", stateOf("/gd-other", "gd layouts")));
      await navigate("/gd/x");
      await navigate("/gd/y");
      expect(shown()).toBe("/gd/y patched");
      await navigate("/gd-other");
      expect(shown()).toBe("/gd-other patched");

      await prefetch("/gd/y");
      await navigate("/gd/y");

      expect(prefetchCountOf("/gd/y")).toBe(1);
      expect(navigationCountOf("/gd/y")).toBe(1);
      expect(shown()).toBe("/gd/y");
    });
  });
});
