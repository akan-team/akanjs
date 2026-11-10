import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactNode, startTransition } from "react";
import { createRoot, type Root } from "react-dom/client";
import { hasRscRouteHead } from "../client/rscRoutePatch";
import type { AkanHeadSnapshotV1 } from "./routeState";
import { applyAkanHeadSnapshotPatch } from "./rscHeadPatch";
import {
  AkanRouteHead,
  AkanSegmentOutlet,
  commitAkanSegmentOutletPatch,
  resetAkanSegmentOutletPatches,
} from "./rscSegmentOutlet";

const layouts: AkanHeadSnapshotV1 = {
  version: 1,
  nodes: [
    { tag: "title", text: "Akan" },
    { tag: "link", attrs: { rel: "icon", href: "/icon.png", sizes: "32x32" } },
  ],
};
const pageOf = (title: string, description: string): AkanHeadSnapshotV1 => ({
  version: 1,
  nodes: [
    { tag: "title", text: title },
    { tag: "meta", attrs: { name: "description", content: description } },
  ],
});
const resolved = (node: ReactNode) => Object.assign(Promise.resolve(node), { status: "fulfilled", value: node });

const headState = () => ({
  title: document.title,
  titles: document.head.querySelectorAll("title").length,
  description: [...document.head.querySelectorAll('meta[name="description"]')].map((meta) =>
    meta.getAttribute("content"),
  ),
  icons: document.head.querySelectorAll('link[rel="icon"]').length,
});

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

const watch = (read: () => string) => {
  const seen: string[] = [];
  const observer = new MutationObserver(() => {
    if (seen.at(-1) !== read()) seen.push(read());
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__AKAN_RSC_ROUTE_PATCH__");
  Reflect.deleteProperty(globalThis, "__AKAN_RSC_SEGMENT_OUTLET_STORE__");
});

describe("AkanRouteHead", () => {
  test("a patch swaps the page's part under the layouts' part, and the next full commit takes it back over", () => {
    const { root, unmount } = mount(<AkanRouteHead layouts={layouts} page={pageOf("Intro", "intro")} />);

    expect(hasRscRouteHead()).toBe(true);
    expect(headState()).toEqual({ title: "Intro", titles: 1, description: ["intro"], icons: 1 });

    act(() => {
      applyAkanHeadSnapshotPatch(pageOf("Routing", "routes"), "/en/docs/routing");
    });
    expect(headState()).toEqual({ title: "Routing", titles: 1, description: ["routes"], icons: 1 });

    act(() => {
      applyAkanHeadSnapshotPatch({ version: 1, nodes: [] }, "/en/docs/untitled");
    });
    expect(headState()).toEqual({ title: "Akan", titles: 1, description: [], icons: 1 });

    act(() => {
      resetAkanSegmentOutletPatches();
      root.render(<AkanRouteHead layouts={layouts} page={pageOf("Home", "home")} />);
    });
    expect(headState()).toEqual({ title: "Home", titles: 1, description: ["home"], icons: 1 });

    unmount();
    expect(hasRscRouteHead()).toBe(false);
    expect(headState()).toEqual({ title: "", titles: 0, description: [], icons: 0 });
  });

  test("a full commit after a patch goes straight to the new head, never back through the last full one", async () => {
    const { root, unmount } = mount(<AkanRouteHead layouts={layouts} page={pageOf("Intro", "intro")} />);
    act(() => {
      applyAkanHeadSnapshotPatch(pageOf("Routing", "routes"), "/en/docs/routing");
    });
    const titles = watch(() => document.title);

    await act(async () => {
      startTransition(() => {
        resetAkanSegmentOutletPatches();
        root.render(<AkanRouteHead layouts={layouts} page={pageOf("Home", "home")} />);
      });
    });
    titles.stop();

    expect(titles.seen).toEqual(["Home"]);
    unmount();
  });

  test("a full commit back to the element the last full commit rendered drops the patch", async () => {
    const element = <AkanRouteHead layouts={layouts} page={pageOf("Intro", "intro")} />;
    const { root, unmount } = mount(element);
    act(() => {
      applyAkanHeadSnapshotPatch(pageOf("Routing", "routes"), "/en/docs/routing");
    });
    expect(document.title).toBe("Routing");

    await act(async () => {
      startTransition(() => {
        resetAkanSegmentOutletPatches();
        root.render(element);
      });
    });

    expect(headState()).toEqual({ title: "Intro", titles: 1, description: ["intro"], icons: 1 });
    unmount();
  });
});

describe("AkanSegmentOutlet", () => {
  test("the head and the body move in the same commit, on a patch and on the full commit after it", async () => {
    const App = ({ title, body }: { title: string; body: string }) => (
      <>
        <AkanRouteHead layouts={layouts} page={pageOf(title, title)} />
        <AkanSegmentOutlet segmentKey="slot:layout:1:2">
          <p>{body}</p>
        </AkanSegmentOutlet>
      </>
    );
    const { container, root, unmount } = mount(<App title="Intro" body="Intro body" />);
    const screens = watch(() => `${document.title}|${container.textContent}`);

    await act(async () => {
      startTransition(() => {
        applyAkanHeadSnapshotPatch(pageOf("Routing", "routes"), "/en/docs/routing");
        commitAkanSegmentOutletPatch("slot:layout:1:2", resolved(<p>Routing body</p>));
      });
    });
    await act(async () => {
      startTransition(() => {
        resetAkanSegmentOutletPatches();
        root.render(<App title="Home" body="Home body" />);
      });
    });
    screens.stop();

    expect(screens.seen).toEqual(["Routing|Routing body", "Home|Home body"]);
    unmount();
  });

  test("shows its children until a patch, and again after the patches reset", async () => {
    const { container, unmount } = mount(
      <AkanSegmentOutlet segmentKey="slot:layout:1:2">
        <p>first</p>
      </AkanSegmentOutlet>,
    );
    expect(container.textContent).toBe("first");

    expect(commitAkanSegmentOutletPatch("slot:other:9", resolved(<p>elsewhere</p>))).toBe(false);
    await act(async () => {
      commitAkanSegmentOutletPatch("slot:layout:1:2", resolved(<p>patched</p>));
    });
    expect(container.textContent).toBe("patched");

    await act(async () => {
      resetAkanSegmentOutletPatches();
    });
    expect(container.textContent).toBe("first");
    unmount();
    expect(commitAkanSegmentOutletPatch("slot:layout:1:2", resolved(<p>gone</p>))).toBe(false);
  });
});
