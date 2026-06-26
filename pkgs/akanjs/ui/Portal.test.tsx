import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { Portal } from "./Portal";
import { createServerPortalStore, ServerPortalOutlet, setActiveServerPortalStore } from "./ServerPortal";

async function renderToText(node: ReactNode): Promise<string> {
  return new Response(await renderToReadableStream(node)).text();
}

describe("Portal", () => {
  test("captures portal children into server outlets", async () => {
    const store = createServerPortalStore();
    setActiveServerPortalStore(store);
    const html = await renderToText(
      <>
        <Portal id="slot">
          <button>Action</button>
        </Portal>
        <div id="slot">
          <ServerPortalOutlet id="slot" />
        </div>
      </>,
    );

    expect(html).toContain("<button>Action</button>");
  });
});
