import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { Portal } from "./Portal";
import { mount } from "./testHelpers.fixture";

async function renderToText(node: ReactNode): Promise<string> {
  return new Response(await renderToReadableStream(node)).text();
}

describe("Portal", () => {
  test("draws nothing on the server", async () => {
    await expect(renderToText(<Portal id="slot">{"content"}</Portal>)).resolves.toBe("");
  });

  test("fills the host once mounted, and empties it when unmounted", () => {
    const host = document.createElement("div");
    host.id = "slot";
    document.body.appendChild(host);
    const { container, unmount } = mount(
      <Portal id="slot">
        <button type="button">Action</button>
      </Portal>,
    );

    expect(host.innerHTML).toBe('<button type="button">Action</button>');
    expect(container.innerHTML).toBe("");
    unmount();
    expect(host.innerHTML).toBe("");
    host.remove();
  });
});
