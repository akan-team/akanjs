import { afterAll, describe, expect, test } from "bun:test";
import { isOwnOverlayClick, OVERLAY_LAYER_ATTR } from "./overlayLayer";

const originalElement = globalThis.Element;

/** Minimal DOM stand-in: a node walks up `parent` until one carries the overlay owner attribute. */
class FakeElement {
  parent: FakeElement | null = null;

  constructor(private readonly owner?: string) {}

  in(parent: FakeElement) {
    this.parent = parent;
    return this;
  }

  closest(selector: string): FakeElement | null {
    if (this.owner !== undefined && selector.includes(OVERLAY_LAYER_ATTR)) return this;
    return this.parent?.closest(selector) ?? null;
  }

  getAttribute(name: string) {
    return name === OVERLAY_LAYER_ATTR ? (this.owner ?? null) : null;
  }
}

globalThis.Element = FakeElement as unknown as typeof Element;

afterAll(() => {
  globalThis.Element = originalElement;
});

const clickIn = (node: FakeElement) => node as unknown as EventTarget;
const overlayOwnedBy = (owner: string) => new FakeElement(owner);

describe("isOwnOverlayClick", () => {
  test("claims an overlay this scope rendered", () => {
    const body = new FakeElement().in(overlayOwnedBy("menu1"));
    expect(isOwnOverlayClick(clickIn(body), "menu1")).toBe(true);
  });

  test("claims an overlay a nested scope rendered", () => {
    const body = new FakeElement().in(overlayOwnedBy("menu1/menu2"));
    expect(isOwnOverlayClick(clickIn(body), "menu1")).toBe(true);
  });

  test("disowns an unrelated overlay and one nobody owns", () => {
    expect(isOwnOverlayClick(clickIn(new FakeElement().in(overlayOwnedBy("menu2"))), "menu1")).toBe(false);
    expect(isOwnOverlayClick(clickIn(new FakeElement().in(overlayOwnedBy(""))), "menu1")).toBe(false);
  });

  test("does not mistake a scope that merely shares a prefix", () => {
    expect(isOwnOverlayClick(clickIn(new FakeElement().in(overlayOwnedBy("menu10"))), "menu1")).toBe(false);
  });

  test("leaves an ordinary page click alone", () => {
    expect(isOwnOverlayClick(clickIn(new FakeElement()), "menu1")).toBe(false);
    expect(isOwnOverlayClick(null, "menu1")).toBe(false);
    expect(isOwnOverlayClick({} as EventTarget, "menu1")).toBe(false);
  });
});
