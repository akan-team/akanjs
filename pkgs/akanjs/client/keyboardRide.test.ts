import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { KeyboardRide } from "./keyboardRide";

const screenBottom = 800;
const coverOf = () => Number.parseFloat(document.documentElement.style.getPropertyValue("--akan-keyboard-cover")) || 0;
const riderOf = (kind = "") => {
  const rider = document.createElement("div");
  rider.setAttribute("data-akan-keyboard-ride", kind);
  rider.getClientRects = () => [{}] as unknown as DOMRectList;
  rider.getBoundingClientRect = () => {
    const shift = Number.parseFloat(rider.style.transform.replace("translateY(", "")) || 0;
    return { bottom: screenBottom - coverOf() + shift } as DOMRect;
  };
  document.body.append(rider);
  return rider;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
//? happy-dom's style is a Proxy that refuses a property spy, so the inline style's history comes from the mutations.
const styleHistoryOf = (element: HTMLElement) => {
  const observer = new MutationObserver(() => undefined);
  observer.observe(element, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  return () => {
    const history = observer.takeRecords().map((record) => record.oldValue ?? "");
    observer.disconnect();
    return [...history, element.getAttribute("style") ?? ""].join(" | ");
  };
};

describe("KeyboardRide", () => {
  test("keys coming up hold the box until they are up, while the rider travels as a transform", async () => {
    const rider = riderOf();
    KeyboardRide.move(300, 20);
    const root = document.documentElement;

    expect(coverOf()).toBe(0);
    expect(root.hasAttribute("data-akan-keyboard")).toBe(true);
    expect(root.hasAttribute("data-akan-keyboard-layout")).toBe(false);
    expect(rider.style.transform).toBe("translateY(-300px)");
    expect(rider.style.transition).toContain("transform 20ms");

    await wait(40);
    expect(coverOf()).toBe(300);
    expect(root.hasAttribute("data-akan-keyboard-layout")).toBe(true);
    expect(rider.style.transform).toBe("");

    KeyboardRide.move(0, 20);
    expect(coverOf()).toBe(0);
    expect(root.hasAttribute("data-akan-keyboard")).toBe(false);
    expect(root.hasAttribute("data-akan-keyboard-layout")).toBe(false);
    expect(rider.style.transform).toBe("translateY(0px)");

    await wait(40);
    expect(rider.style.transform).toBe("");
    rider.remove();
  });

  test("a repeated report of the same keys starts nothing over", async () => {
    const rider = riderOf();
    KeyboardRide.move(280, 20);
    const transform = rider.style.transform;
    KeyboardRide.move(280, 20);
    expect(rider.style.transform).toBe(transform);
    await wait(40);
    KeyboardRide.move(0, 20);
    await wait(40);
    rider.remove();
  });

  test("a field in an overlay keeps the whole screen: riders stay carried and a list takes the rise as padding, never a transform", async () => {
    const root = document.documentElement;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-akan-keyboard-overlay", "");
    const field = document.createElement("textarea");
    overlay.append(field);
    document.body.append(overlay);
    field.focus();
    const composer = riderOf();
    const list = riderOf("inset");
    list.style.paddingBottom = "12px";
    const listHistory = styleHistoryOf(list);
    KeyboardRide.move(300, 20);

    expect(coverOf()).toBe(0);
    expect(root.hasAttribute("data-akan-keyboard-overlay")).toBe(true);
    expect(root.hasAttribute("data-akan-keyboard-layout")).toBe(false);
    expect(composer.style.transform).toBe("translateY(-300px)");
    expect(list.style.paddingBottom).toContain("300px");

    await wait(40);
    expect(coverOf()).toBe(0);
    expect(composer.style.transform).toBe("translateY(-300px)");
    expect(list.style.paddingBottom).toContain("300px");

    KeyboardRide.move(0, 20);
    expect(root.hasAttribute("data-akan-keyboard-overlay")).toBe(false);
    expect(list.style.paddingBottom).toBe("12px");
    expect(composer.style.transform).toBe("translateY(0px)");
    expect(listHistory()).not.toContain("translateY");
    await wait(40);
    expect(composer.style.transform).toBe("");
    for (const element of [overlay, composer, list]) element.remove();
  });

  test("a list resting at its end scrolls the rise with the keys and back down with them", async () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-akan-keyboard-overlay", "");
    const field = document.createElement("textarea");
    overlay.append(field);
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const list = riderOf("inset");
    scroller.append(list);
    document.body.append(scroller, overlay);
    field.focus();
    const riseOf = () => Number.parseFloat(list.style.paddingBottom.split("+ ").at(1) ?? "") || 0;
    let scrollTop = 600;
    Object.defineProperty(scroller, "scrollHeight", { get: () => 1000 + riseOf(), configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(value, 600 + riseOf());
      },
      configurable: true,
    });

    KeyboardRide.move(300, 20);
    expect(list.style.paddingBottom).toContain("300px");
    expect(list.style.transform).toBe("");
    await wait(80);
    expect(scrollTop).toBe(900);

    KeyboardRide.move(0, 20);
    expect(list.style.paddingBottom).toContain("300px");
    await wait(80);
    expect(scrollTop).toBe(600);
    expect(list.style.paddingBottom).toBe("");
    for (const element of [overlay, scroller]) element.remove();
  });
});
