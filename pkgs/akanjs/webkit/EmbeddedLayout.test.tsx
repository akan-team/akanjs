import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode, Suspense, use } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgenticSurface, AgentProvider, useAgentTool } from "use-agentic";
import { EmbeddedLayout, LayoutOutlet } from "./EmbeddedLayout";

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
});

const isShown = (element: Element | null) => {
  if (!element) return false;
  for (let node: Element | null = element; node; node = node.parentElement)
    if (node.hasAttribute("hidden") || (node as HTMLElement).style.display === "none") return false;
  return true;
};

const deferred = () => {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const Chrome = () => {
  useAgentTool("openMenu", { description: "Open the menu." }, () => "opened");
  return <nav>tabs</nav>;
};
const Page = ({ note }: { note: Promise<string> }) => <p>{use(note)}</p>;
const Layout = ({ children }: { children: ReactNode }) => (
  <div>
    <Chrome />
    <Suspense fallback={<i>loading</i>}>{children}</Suspense>
  </div>
);
const viewOf = (note: Promise<string>) => (
  <EmbeddedLayout>
    <Layout>
      <LayoutOutlet>
        <Page note={note} />
      </LayoutOutlet>
    </Layout>
  </EmbeddedLayout>
);

let mounted: { root: Root; container: HTMLElement } | null = null;
const surface = new AgenticSurface();
const render = async (node: ReactNode) => {
  if (!mounted) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mounted = { root: createRoot(container), container };
  }
  const { root, container } = mounted;
  await act(async () => root.render(<AgentProvider surface={surface}>{node}</AgentProvider>));
  return container;
};
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const toolNames = () => surface.snapshot().tools.map((tool) => tool.name);

afterEach(async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = null;
});

describe("EmbeddedLayout", () => {
  test("keeps the layout hidden while the page it shows waits inside the layout's own Suspense", async () => {
    const note = deferred();
    const container = await render(viewOf(note.promise));

    expect(isShown(container.querySelector("nav"))).toBe(false);
    expect(isShown(container.querySelector("i"))).toBe(false);
    expect(toolNames()).not.toContain("openMenu");

    await act(async () => note.resolve("Seoul"));
    await settle();

    expect(container.querySelector("p")?.textContent).toBe("Seoul");
    expect(isShown(container.querySelector("p"))).toBe(true);
    expect(isShown(container.querySelector("nav"))).toBe(false);
    expect(toolNames()).not.toContain("openMenu");
  });

  test("keeps it hidden when a page already on screen suspends again", async () => {
    const first = Promise.resolve("Seoul");
    const container = await render(viewOf(first));
    await settle();
    expect(container.querySelector("p")?.textContent).toBe("Seoul");

    const next = deferred();
    await render(viewOf(next.promise));

    expect(isShown(container.querySelector("nav"))).toBe(false);
    expect(toolNames()).not.toContain("openMenu");

    await act(async () => next.resolve("Busan"));
    await settle();

    expect(container.querySelector("p")?.textContent).toBe("Busan");
    expect(isShown(container.querySelector("p"))).toBe(true);
    expect(isShown(container.querySelector("nav"))).toBe(false);
  });

  test("shows the layout once it stops drawing the page, as a gate does", async () => {
    const note = Promise.resolve("Seoul");
    const container = await render(viewOf(note));
    await settle();
    expect(isShown(container.querySelector("nav"))).toBe(false);

    await render(
      <EmbeddedLayout>
        <Layout>
          <span>Sign in first</span>
        </Layout>
      </EmbeddedLayout>,
    );
    await settle();

    expect(container.querySelector("p")).toBeNull();
    expect(isShown(container.querySelector("span"))).toBe(true);
    expect(isShown(container.querySelector("nav"))).toBe(true);
    expect(toolNames()).toContain("openMenu");
  });
});
