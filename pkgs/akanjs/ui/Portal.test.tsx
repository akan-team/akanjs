import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { Portal } from "./Portal";

async function renderToText(node: ReactNode): Promise<string> {
  return new Response(await renderToReadableStream(node)).text();
}

describe("Portal", () => {
  test("draws its fallback in place on the server, where no target exists", async () => {
    const html = await renderToText(
      <Portal id="slot" fallback={<aside>inline</aside>}>
        <button type="button">Action</button>
      </Portal>,
    );

    expect(html).toBe("<aside>inline</aside>");
  });

  test("draws nothing on the server without a fallback", async () => {
    await expect(renderToText(<Portal id="slot">{"content"}</Portal>)).resolves.toBe("");
  });
});
