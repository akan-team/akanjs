import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { createSystemPageDocument } from "./systemPageDocument";

const renderServer = async (node: ReactNode) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
  }
};

describe("createSystemPageDocument", () => {
  test("hydrates without a mismatch under the data-theme the HTML stream adds to <html>", async () => {
    const node = createSystemPageDocument({ kind: "not-found", pathname: "/en/missing", homeHref: "/en", lang: "en" });
    const html = (await renderServer(node)).replace('<html lang="en">', '<html lang="en" data-theme="dark">');
    expect(html).toContain('data-theme="dark"');
    document.open();
    document.write(html);
    document.close();
    const errors: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.map(String).join(" "));
    let root: ReturnType<typeof hydrateRoot> | null = null;
    try {
      await act(async () => {
        root = hydrateRoot(document, node, { onRecoverableError: (error) => void errors.push(String(error)) });
      });
    } finally {
      console.error = consoleError;
    }
    expect(errors).toEqual([]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    act(() => root?.unmount());
  });
});
