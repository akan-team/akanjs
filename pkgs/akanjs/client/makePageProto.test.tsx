import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { pathContext } from "./csrTypes";
import { makePageProto } from "./makePageProto";
import { Translator } from "./translator";

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
});

const visit = (path: string) =>
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`http://localhost${path}`);
const { usePage } = makePageProto({});
const PathProbe = () => <span>{usePage().path}</span>;

let mounted: { root: Root; container: HTMLElement } | null = null;
const draw = async (location: { pathname: string } | undefined, followsRouter?: boolean) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(
      <pathContext.Provider value={{ location, followsRouter } as never}>
        <PathProbe />
      </pathContext.Provider>,
    );
  });
  return container.textContent;
};

afterEach(async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = null;
});

describe("usePage path in a frame", () => {
  test("a component of a page drawn ahead of the router reads its own entry's path", async () => {
    Translator.markHydrated();
    visit("/en/chat");
    expect(await draw({ pathname: "/en/chat/7/members" })).toBe("/chat/7/members");
    expect(usePage().path).toBe("/chat");
  });

  test("an SSR page, which follows the router, and a tree outside any page read the URL", async () => {
    Translator.markHydrated();
    visit("/en/notes");
    expect(await draw({ pathname: "/en/old" }, true)).toBe("/notes");
    await act(async () => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = null;
    expect(await draw(undefined)).toBe("/notes");
  });
});
