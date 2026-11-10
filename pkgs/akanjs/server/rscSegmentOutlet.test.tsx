import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { hasRscRouteHead } from "../client/rscNavigation";
import type { AkanHeadSnapshotV1 } from "./routeState";
import { applyAkanHeadSnapshotPatch } from "./rscHeadPatch";
import { AkanRouteHead, resetAkanSegmentOutletPatches } from "./rscSegmentOutlet";

const snapshotOf = (title: string, description: string): AkanHeadSnapshotV1 => ({
  version: 1,
  nodes: [
    { tag: "title", text: title },
    { tag: "meta", attrs: { name: "description", content: description } },
    { tag: "link", attrs: { rel: "icon", href: "/icon.png", sizes: "32x32" } },
  ],
});

const headState = () => ({
  title: document.title,
  titles: document.head.querySelectorAll("title").length,
  description: [...document.head.querySelectorAll('meta[name="description"]')].map((meta) =>
    meta.getAttribute("content"),
  ),
  icons: document.head.querySelectorAll('link[rel="icon"]').length,
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__AKAN_RSC_ROUTE_PATCH__");
});

describe("AkanRouteHead", () => {
  test("a patch swaps the head React renders, and the next full commit takes it back over", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<AkanRouteHead snapshot={snapshotOf("Intro", "intro")} />));

    expect(hasRscRouteHead()).toBe(true);
    expect(headState()).toEqual({ title: "Intro", titles: 1, description: ["intro"], icons: 1 });

    act(() => {
      applyAkanHeadSnapshotPatch(snapshotOf("Routing", "routes"), "/en/docs/routing");
    });
    expect(headState()).toEqual({ title: "Routing", titles: 1, description: ["routes"], icons: 1 });

    act(() => {
      resetAkanSegmentOutletPatches();
      root.render(<AkanRouteHead snapshot={snapshotOf("Home", "home")} />);
    });
    expect(headState()).toEqual({ title: "Home", titles: 1, description: ["home"], icons: 1 });

    act(() => root.unmount());
    container.remove();
    expect(hasRscRouteHead()).toBe(false);
    expect(headState()).toEqual({ title: "", titles: 0, description: [], icons: 0 });
  });

  test("a full commit after a patch goes straight to the new head, never back through the last full one", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<AkanRouteHead snapshot={snapshotOf("Intro", "intro")} />));
    act(() => {
      applyAkanHeadSnapshotPatch(snapshotOf("Routing", "routes"), "/en/docs/routing");
    });
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      if (seen.at(-1) !== document.title) seen.push(document.title);
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });

    await act(async () => {
      startTransition(() => {
        resetAkanSegmentOutletPatches();
        root.render(<AkanRouteHead snapshot={snapshotOf("Home", "home")} />);
      });
    });
    observer.disconnect();

    expect(seen).toEqual(["Home"]);
    act(() => root.unmount());
    container.remove();
  });
});
