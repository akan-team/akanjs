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

  test("a list resting at its end is measured without being scrolled, then scrolls the rise with the keys and back", async () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-akan-keyboard-overlay", "");
    const field = document.createElement("textarea");
    overlay.append(field);
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    scroller.getBoundingClientRect = () => ({ bottom: screenBottom - coverOf() }) as DOMRect;
    const list = riderOf("inset");
    scroller.append(list);
    document.body.append(scroller, overlay);
    field.focus();
    const riseOf = () => Number.parseFloat(list.style.paddingBottom.split("+ ").at(1) ?? "") || 0;
    let scrollTop = 600;
    let setNum = 0;
    Object.defineProperty(scroller, "scrollHeight", { get: () => 1000 + riseOf(), configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        setNum += 1;
        scrollTop = Math.min(value, 600 + riseOf());
      },
      configurable: true,
    });

    KeyboardRide.move(300, 20);
    expect(setNum).toBe(0);
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
  test("a list laid out from its bottom keeps its lines where they were drawn and scrolls them up only from its end", async () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-akan-keyboard-overlay", "");
    const field = document.createElement("textarea");
    overlay.append(field);
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    scroller.getBoundingClientRect = () => ({ bottom: screenBottom - coverOf() }) as DOMRect;
    scroller.style.display = "flex";
    scroller.style.flexDirection = "column-reverse";
    const list = riderOf("inset");
    scroller.append(list);
    document.body.append(scroller, overlay);
    field.focus();
    const riseOf = () => Number.parseFloat(list.style.paddingBottom.split("+ ").at(1) ?? "") || 0;
    let scrollTop = 0;
    Object.defineProperty(scroller, "scrollHeight", { get: () => 1000 + riseOf(), configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(0, Math.max(value, -(600 + riseOf())));
      },
      configurable: true,
    });

    KeyboardRide.move(300, 20);
    expect(scrollTop).toBe(-300);
    expect(scroller.hasAttribute("data-akan-keyboard-glide")).toBe(true);
    await wait(80);
    expect(scrollTop).toBe(0);
    expect(scroller.hasAttribute("data-akan-keyboard-glide")).toBe(false);

    KeyboardRide.move(0, 20);
    await wait(80);
    expect(scrollTop).toBe(0);
    expect(list.style.paddingBottom).toBe("");

    scrollTop = -100;
    KeyboardRide.move(300, 20);
    expect(scrollTop).toBe(-400);
    await wait(80);
    expect(scrollTop).toBe(-400);
    KeyboardRide.move(0, 20);
    expect(scrollTop).toBe(-100);
    expect(list.style.paddingBottom).toBe("");
    for (const element of [overlay, scroller]) element.remove();
  });

  test("a list rises as far as the rider holding the field, not by a box that runs on under a bar the keys cover", async () => {
    const composer = document.createElement("div");
    composer.setAttribute("data-akan-keyboard-ride", "");
    composer.setAttribute("data-akan-keyboard-overlay", "");
    composer.getClientRects = () => [{}] as unknown as DOMRectList;
    composer.getBoundingClientRect = () => {
      const shift = Number.parseFloat(composer.style.transform.replace("translateY(", "")) || 0;
      return { bottom: (coverOf() > 0 ? screenBottom - coverOf() : screenBottom - 100) + shift } as DOMRect;
    };
    const field = document.createElement("textarea");
    composer.append(field);
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    scroller.getBoundingClientRect = () => ({ bottom: screenBottom - coverOf() }) as DOMRect;
    const list = riderOf("inset");
    scroller.append(list);
    document.body.append(scroller, composer);
    field.focus();

    KeyboardRide.move(300, 20);
    expect(composer.style.transform).toBe("translateY(-200px)");
    expect(list.style.paddingBottom).toContain("+ 200px");
    expect(field.style.caretColor).toBe("transparent");
    await wait(40);
    expect(field.style.caretColor).toBe("");
    KeyboardRide.move(0, 20);
    await wait(40);
    expect(list.style.paddingBottom).toBe("");
    for (const element of [composer, scroller]) element.remove();
  });

  test("a list too short to scroll the rise rides the rest as a transform, up with the keys and down with them", async () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-akan-keyboard-overlay", "");
    const field = document.createElement("textarea");
    overlay.append(field);
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    scroller.style.display = "flex";
    scroller.style.flexDirection = "column-reverse";
    scroller.getBoundingClientRect = () => ({ bottom: screenBottom - coverOf() }) as DOMRect;
    const list = riderOf("inset");
    scroller.append(list);
    document.body.append(scroller, overlay);
    field.focus();
    const riseOf = () => Number.parseFloat(list.style.paddingBottom.split("+ ").at(1) ?? "") || 0;
    let scrollTop = 0;
    const scrollHeightOf = () => Math.max(400, 200 + riseOf());
    Object.defineProperty(scroller, "scrollHeight", { get: scrollHeightOf, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(scroller, "scrollTop", {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(0, Math.max(value, -(scrollHeightOf() - 400)));
      },
      configurable: true,
    });
    list.getBoundingClientRect = () => {
      const shift = Number.parseFloat(list.style.transform.replace("translateY(", "")) || 0;
      return { top: screenBottom - 200 - riseOf() - scrollTop + shift } as DOMRect;
    };
    const upHistory = styleHistoryOf(list);

    KeyboardRide.move(300, 20);
    expect(upHistory()).toContain("translateY(200px)");
    expect(list.style.transform).toBe("");
    await wait(80);
    expect(scrollTop).toBe(0);
    expect(list.getBoundingClientRect().top).toBe(300);

    const downHistory = styleHistoryOf(list);
    KeyboardRide.move(0, 20);
    expect(list.style.paddingBottom).toBe("");
    expect(downHistory()).toContain("translateY(-300px)");
    expect(list.getBoundingClientRect().top).toBe(600);
    await wait(40);
    for (const element of [overlay, scroller]) element.remove();
  });

  test("riders start as far along as the measuring took, so they keep pace with keys that set off before it", async () => {
    const rider = riderOf();
    const measure = rider.getBoundingClientRect;
    rider.getBoundingClientRect = () => {
      const until = performance.now() + 15;
      while (performance.now() < until);
      return measure();
    };
    KeyboardRide.move(300, 200);
    const delay = Number.parseFloat(rider.style.transition.split(" ").at(-1) ?? "");
    expect(delay).toBeLessThanOrEqual(-30);
    rider.getBoundingClientRect = measure;
    await wait(220);
    KeyboardRide.move(0, 20);
    await wait(40);
    rider.remove();
  });
});
