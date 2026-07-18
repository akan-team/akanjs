import { afterEach, describe, expect, test } from "bun:test";
import type { AkanHeadSnapshotV1 } from "./routeState";
import {
  applyAkanHeadSnapshotPatch,
  canApplyAkanHeadSnapshotPatch,
  commitPreparedAkanHeadSnapshotPatch,
  getAkanHeadSnapshotPatchFailureReason,
  prepareAkanHeadSnapshotPatch,
  rollbackPreparedAkanHeadSnapshotPatch,
} from "./rscHeadPatch";

class FakeElement {
  readonly attrs = new Map<string, string>();
  textContent = "";
  parentNode?: FakeHead;
  throwOnSetAttribute = false;

  constructor(readonly tagName: string) {}

  setAttribute(key: string, value: string): void {
    if (this.throwOnSetAttribute) throw new Error("setAttribute failed");
    this.attrs.set(key, value);
  }

  getAttribute(key: string): string | null {
    return this.attrs.get(key) ?? null;
  }

  remove(): void {
    this.parentNode?.remove(this);
  }
}

class FakeFragment {
  readonly children: FakeElement[] = [];

  appendChild(element: FakeElement): void {
    this.children.push(element);
  }
}

class ThrowingFakeDocument {
  constructor(readonly head: FakeHead) {}

  createElement(tag: string): FakeElement {
    const element = new FakeElement(tag);
    element.throwOnSetAttribute = true;
    return element;
  }

  createDocumentFragment(): FakeFragment {
    return new FakeFragment();
  }
}

class FakeHead {
  readonly nodes: FakeElement[] = [];

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== '[data-akan-head="route"]') return [];
    return this.nodes.filter((node) => node.getAttribute("data-akan-head") === "route");
  }

  insertBefore(fragment: FakeFragment, anchor: FakeElement): void {
    const index = this.nodes.indexOf(anchor);
    if (index < 0) return;
    for (const child of fragment.children) child.parentNode = this;
    this.nodes.splice(index, 0, ...fragment.children);
  }

  append(element: FakeElement): void {
    element.parentNode = this;
    this.nodes.push(element);
  }

  remove(element: FakeElement): void {
    const index = this.nodes.indexOf(element);
    if (index >= 0) this.nodes.splice(index, 1);
  }
}

function installFakeDocument(head: FakeHead): void {
  (globalThis as typeof globalThis & { document?: Document }).document = {
    head,
    createElement: (tag: string) => new FakeElement(tag),
    createDocumentFragment: () => new FakeFragment(),
  } as unknown as Document;
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { document?: Document }).document;
});

describe("RSC head snapshot patch", () => {
  test("replaces route-owned head nodes without touching framework-owned nodes", () => {
    const head = new FakeHead();
    const oldTitle = new FakeElement("title");
    oldTitle.setAttribute("data-akan-head", "route");
    const stylesheet = new FakeElement("link");
    stylesheet.setAttribute("rel", "stylesheet");
    head.append(oldTitle);
    head.append(stylesheet);
    installFakeDocument(head);
    const snapshot: AkanHeadSnapshotV1 = {
      version: 1,
      nodes: [
        { tag: "title", text: "API" },
        { tag: "meta", attrs: { name: "description", content: "Docs API" } },
      ],
    };

    expect(getAkanHeadSnapshotPatchFailureReason(snapshot)).toBeNull();
    expect(canApplyAkanHeadSnapshotPatch(snapshot)).toBe(true);
    expect(applyAkanHeadSnapshotPatch(snapshot)).toBe(true);
    expect(head.nodes.map((node) => node.tagName)).toEqual(["title", "meta", "link"]);
    expect(head.nodes[0]?.textContent).toBe("API");
    expect(head.nodes[1]?.getAttribute("name")).toBe("description");
    expect(head.nodes[2]).toBe(stylesheet);
  });

  test("rejects patches when no route-owned head marker is mounted", () => {
    const head = new FakeHead();
    head.append(new FakeElement("link"));
    installFakeDocument(head);

    expect(getAkanHeadSnapshotPatchFailureReason({ version: 1, nodes: [] })).toBe("head-missing");
    expect(canApplyAkanHeadSnapshotPatch({ version: 1, nodes: [] })).toBe(false);
    expect(applyAkanHeadSnapshotPatch({ version: 1, nodes: [] })).toBe(false);
  });

  test("can rollback a prepared head patch when a later commit step fails", () => {
    const head = new FakeHead();
    const oldTitle = new FakeElement("title");
    oldTitle.setAttribute("data-akan-head", "route");
    oldTitle.textContent = "Intro";
    head.append(oldTitle);
    installFakeDocument(head);
    const prepared = prepareAkanHeadSnapshotPatch({
      version: 1,
      nodes: [{ tag: "title", text: "API" }],
    });
    if (!prepared) throw new Error("head patch was not prepared");

    expect(commitPreparedAkanHeadSnapshotPatch(prepared)).toBe(true);
    expect(head.nodes[0]?.textContent).toBe("API");
    rollbackPreparedAkanHeadSnapshotPatch(prepared);
    expect(head.nodes).toEqual([oldTitle]);
    expect(head.nodes[0]?.textContent).toBe("Intro");
  });

  test("returns false without mutating existing head when DOM creation throws", () => {
    const head = new FakeHead();
    const oldTitle = new FakeElement("title");
    oldTitle.setAttribute("data-akan-head", "route");
    head.append(oldTitle);
    (globalThis as typeof globalThis & { document?: Document }).document = new ThrowingFakeDocument(
      head,
    ) as unknown as Document;

    expect(
      applyAkanHeadSnapshotPatch({
        version: 1,
        nodes: [{ tag: "title", text: "API" }],
      }),
    ).toBe(false);
    expect(head.nodes).toEqual([oldTitle]);
  });
});
