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

  test("a field in an overlay keeps the whole screen: riders stay carried and a list trades its lift for padding", async () => {
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
    KeyboardRide.move(300, 20);

    expect(coverOf()).toBe(0);
    expect(root.hasAttribute("data-akan-keyboard-overlay")).toBe(true);
    expect(root.hasAttribute("data-akan-keyboard-layout")).toBe(false);
    expect(composer.style.transform).toBe("translateY(-300px)");

    await wait(40);
    expect(coverOf()).toBe(0);
    expect(composer.style.transform).toBe("translateY(-300px)");
    expect(list.style.transform).toBe("");
    expect(list.style.paddingBottom).toContain("300px");

    KeyboardRide.move(0, 20);
    expect(root.hasAttribute("data-akan-keyboard-overlay")).toBe(false);
    expect(list.style.paddingBottom).toBe("12px");
    expect(composer.style.transform).toBe("translateY(0px)");
    await wait(40);
    expect(composer.style.transform).toBe("");
    for (const element of [overlay, composer, list]) element.remove();
  });
});
