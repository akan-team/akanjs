import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { scrollerTakesDrag } from "./scrollerTakesDrag";

interface Box {
  style?: Partial<CSSStyleDeclaration>;
  width?: [scroll: number, client: number];
  height?: [scroll: number, client: number];
  left?: number;
  top?: number;
}

const boxOf = ({ style = {}, width = [100, 100], height = [100, 100], left = 0, top = 0 }: Box) => {
  const node = document.createElement("div");
  Object.assign(node.style, style);
  const sizes = { scrollWidth: width[0], clientWidth: width[1], scrollHeight: height[0], clientHeight: height[1] };
  for (const [key, value] of Object.entries(sizes)) Object.defineProperty(node, key, { value });
  Object.defineProperty(node, "scrollLeft", { value: left });
  Object.defineProperty(node, "scrollTop", { value: top });
  return node;
};

const nest = (...boxes: HTMLElement[]) => {
  boxes.reduce((parent, child) => {
    parent.append(child);
    return child;
  });
  document.body.append(boxes[0] as HTMLElement);
  return boxes.at(-1) as HTMLElement;
};

describe("scrollerTakesDrag", () => {
  test("a page with nothing to scroll sideways leaves a swipe to the page", () => {
    const frame = boxOf({ style: { overflowY: "auto" }, height: [2000, 800] });
    const row = nest(frame, boxOf({}));
    expect(scrollerTakesDrag(row, frame, "x", 40)).toBe(false);
  });

  test("a sideways scroller takes a swipe only while it can still scroll that way", () => {
    const frame = boxOf({});
    const start = boxOf({ style: { overflowX: "auto" }, width: [600, 300], left: 0 });
    const chip = nest(frame, start, boxOf({}));
    expect(scrollerTakesDrag(chip, frame, "x", 40)).toBe(false);
    expect(scrollerTakesDrag(chip, frame, "x", -40)).toBe(true);
    start.remove();
    const scrolled = boxOf({ style: { overflowX: "auto" }, width: [600, 300], left: 120 });
    expect(scrollerTakesDrag(nest(frame, scrolled, boxOf({})), frame, "x", 40)).toBe(true);
  });

  test("a list scrolled down takes a downward drag, and lets it go at its top", () => {
    const top = boxOf({ style: { overflowY: "auto" }, height: [2000, 800], top: 0 });
    expect(scrollerTakesDrag(nest(top, boxOf({})), top, "y", 40)).toBe(false);
    const scrolled = boxOf({ style: { overflowY: "auto" }, height: [2000, 800], top: 300 });
    expect(scrollerTakesDrag(nest(scrolled, boxOf({})), scrolled, "y", 40)).toBe(true);
  });

  test("a reversed chat list at its newest line can still scroll back toward its oldest", () => {
    const chat = boxOf({
      style: { overflowY: "auto", display: "flex", flexDirection: "column-reverse" },
      height: [2000, 800],
    });
    expect(scrollerTakesDrag(nest(chat, boxOf({})), chat, "y", 40)).toBe(true);
    expect(scrollerTakesDrag(chat, chat, "y", -40)).toBe(false);
  });

  test("a scroller above the frame is not the page's to give up", () => {
    const outer = boxOf({ style: { overflowX: "auto" }, width: [600, 300], left: 120 });
    const frame = boxOf({});
    const row = nest(outer, frame, boxOf({}));
    expect(scrollerTakesDrag(row, frame, "x", 40)).toBe(false);
  });
});
