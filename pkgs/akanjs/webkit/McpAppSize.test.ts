import "../test/registerDom";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { McpAppBridge } from "./McpAppBridge";
import { McpAppSize } from "./McpAppSize";

const sizes: number[] = [];
const bridge = {
  notify: (method: string, params: { height: number }) => {
    if (method === "ui/notifications/size-changed") sizes.push(params.height);
  },
} as unknown as McpAppBridge;

let height = 100;
const size = new McpAppSize(bridge);
const box = document.createElement("div");
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const settled = () => new Promise((resolve) => setTimeout(resolve, McpAppSize.styleSettleMs + 20));

beforeAll(async () => {
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => height });
  document.body.append(box);
  size.watch();
  await nextFrame();
});

afterAll(() => {
  size.unwatch();
});

describe("McpAppSize", () => {
  test("reports on the next frame after an attribute that can resize the view changes", async () => {
    expect(sizes).toEqual([100]);

    height = 140;
    box.className = "h-40";
    await nextFrame();
    height = 180;
    box.setAttribute("data-state", "open");
    await nextFrame();
    expect(sizes).toEqual([100, 140, 180]);
  });

  test("waits for inline styles to stop changing, then reports the size they left", async () => {
    sizes.length = 0;
    for (const step of [1, 2, 3]) {
      height = 180 + step * 10;
      box.style.height = `${step * 10}px`;
      await nextFrame();
    }
    expect(sizes).toEqual([]);

    await settled();
    expect(sizes).toEqual([210]);
  });
});
