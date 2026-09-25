import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";

let Select: typeof import("./Select").Select;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "selecttest";
  process.env.AKAN_PUBLIC_REPO_NAME = "selecttest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ Select } = await import("./Select"));
});

/** Renders with `document` taken away, which is the only difference the server render actually sees. */
const renderServer = async (node: ReactNode) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
  }
};

const hydrate = async (node: ReactNode) => {
  const html = await renderServer(node);
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = html;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, node, {
      onRecoverableError: (error) => {
        errors.push(error);
      },
    });
  });
  return {
    container,
    errors,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
};

const field = () => <Select value="a" options={["a", "b"]} onChange={() => undefined} />;

describe("Select", () => {
  test("hydrates an SSR render without a mismatch", async () => {
    const { errors, unmount } = await hydrate(field());
    expect(errors).toEqual([]);
    unmount();
  });

  test("mounts the options panel outside the field once the client has it", async () => {
    const { container, unmount } = await hydrate(field());
    const panel = [...document.body.querySelectorAll("[data-open]")].find((el) => !container.contains(el));
    expect(panel).toBeDefined();
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.getAttribute("data-open")).toBe("false");
    unmount();
  });
});
