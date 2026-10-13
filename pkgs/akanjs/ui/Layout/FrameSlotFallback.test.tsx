import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "../testHelpers.fixture";

let FrameSlotFallback: typeof import("./FrameSlotFallback").FrameSlotFallback;

beforeAll(async () => {
  setTestEnv("frameslotfallbacktest");
  process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
  ({ FrameSlotFallback } = await import("./FrameSlotFallback"));
});

const renderToText = async (node: ReactNode) => new Response(await renderToReadableStream(node)).text();

describe("FrameSlotFallback", () => {
  test("top chrome drawn on the server lets it through the frame's top slots, which paint over it while empty", async () => {
    const html = await renderToText(
      <>
        <FrameSlotFallback slot="topInset">
          <b>bar</b>
        </FrameSlotFallback>
        <FrameSlotFallback slot="topLeftAction">
          <i>back</i>
        </FrameSlotFallback>
      </>,
    );

    expect(html).toContain(
      "#topInsetContainer:has(> #topInsetContent:empty){background-color:transparent;pointer-events:none}",
    );
    expect(html).toContain("#topLeftActionContainer:has(> #topLeftActionContent:empty){pointer-events:none}");
    expect(html).toContain("<b>bar</b>");
    expect(html).toContain("<i>back</i>");
  });

  test("bottom chrome needs no such rule: its slots are already transparent and let clicks through", async () => {
    const html = await renderToText(
      <FrameSlotFallback slot="bottomInset">
        <p>composer</p>
      </FrameSlotFallback>,
    );

    expect(html).not.toContain("<style");
    expect(html).toContain("<p>composer</p>");
  });
});
