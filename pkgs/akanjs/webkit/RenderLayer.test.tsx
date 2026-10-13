import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { type RouteRender, useInHiddenLayout } from "akanjs/client";
import { act, createContext, type ReactNode, useContext, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgenticSurface, AgentProvider, useAgentGuide, useAgentTool } from "use-agentic";
import { RenderLayer } from "./RenderLayer";

class UnreachableErr extends Error {
  constructor() {
    super("base.error.serverUnreachable");
  }
}

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
});

let mounted: { root: Root; container: HTMLElement } | null = null;
const mount = async (renders: RouteRender[], { isEmbedded = false, surface = new AgenticSurface() } = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(
      <AgentProvider surface={surface}>
        <RenderLayer renders={renders} index={0} params={{}} searchParams={{}} isEmbedded={isEmbedded} />
      </AgentProvider>,
    );
  });
  return container;
};
const isShown = (element: Element | null) => {
  if (!element) return false;
  for (let node: Element | null = element; node; node = node.parentElement)
    if (node.hasAttribute("hidden")) return false;
  return true;
};

const Trip = createContext("none");
const Chrome = () => {
  const isHidden = useInHiddenLayout();
  useAgentTool("openMenu", { description: "Open the menu." }, () => "opened");
  useAgentGuide("Trips are shared with everyone on them.");
  return <nav data-hidden-chrome={String(isHidden)}>tabs</nav>;
};
const Page = () => {
  const trip = useContext(Trip);
  const isHidden = useInHiddenLayout();
  useAgentTool("saveNote", { description: "Save the note." }, () => "saved");
  return <p data-hidden-chrome={String(isHidden)}>notes of {trip}</p>;
};
const layoutOf = (render: (props: { children: ReactNode }) => ReactNode, isAsync = false): RouteRender => ({
  kind: "layout",
  isAsync,
  render: (isAsync ? async (props: { children: ReactNode }) => render(props) : render) as RouteRender["render"],
});
const page: RouteRender = { kind: "page", render: (() => <Page />) as RouteRender["render"] };
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

afterEach(async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = null;
});

describe("RenderLayer", () => {
  test("a page whose render cannot reach the server says so and renders again on retry", async () => {
    let calls = 0;
    const page: RouteRender = {
      kind: "page",
      isAsync: true,
      render: async () => {
        calls += 1;
        if (calls === 1) throw new UnreachableErr();
        return <main>loaded</main>;
      },
    };
    const container = await mount([page]);
    await settle();

    expect(container.querySelector("[role=alert]")?.textContent).toContain("base.error.serverUnreachable");
    const retry = container.querySelector("button");
    expect(retry).not.toBeNull();

    await act(async () => retry?.click());
    await settle();

    expect(calls).toBe(2);
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(container.textContent).toBe("loaded");
  });

  describe("in an MCP view", () => {
    test("runs every layout, hides what each draws around the page, and shows the page alone", async () => {
      let ran = 0;
      const Effect = () => {
        useEffect(() => {
          ran += 1;
        }, []);
        return null;
      };
      const tabs = layoutOf(({ children }) => (
        <Trip.Provider value="Seoul">
          <Effect />
          <Chrome />
          <div className="md:flex">{children}</div>
        </Trip.Provider>
      ));
      const header = layoutOf(
        ({ children }) => (
          <section>
            <h1>Trip header</h1>
            {children}
          </section>
        ),
        true,
      );
      const surface = new AgenticSurface();
      const container = await mount([tabs, header, page], { isEmbedded: true, surface });
      await settle();

      const shown = container.querySelector("p");
      expect(shown?.textContent).toBe("notes of Seoul");
      expect(isShown(shown)).toBe(true);
      expect(shown?.getAttribute("data-hidden-chrome")).toBe("false");
      expect(isShown(container.querySelector("nav"))).toBe(false);
      expect(container.querySelector("nav")?.getAttribute("data-hidden-chrome")).toBe("true");
      expect(isShown(container.querySelector("h1"))).toBe(false);
      expect(ran).toBe(1);
      const snapshot = surface.snapshot();
      expect(snapshot.tools.map((tool) => tool.name)).toEqual(["saveNote"]);
      expect(snapshot.guides).toEqual(["Trips are shared with everyone on them."]);
    });

    test("shows a layout that draws no page, as a gate does, and its chrome with it", async () => {
      const gate = layoutOf(() => (
        <div>
          <Chrome />
          <span>Sign in first</span>
        </div>
      ));
      const surface = new AgenticSurface();
      const container = await mount([gate, page], { isEmbedded: true, surface });

      expect(isShown(container.querySelector("span"))).toBe(true);
      expect(container.querySelector("nav")?.getAttribute("data-hidden-chrome")).toBe("false");
      expect(container.querySelector("p")).toBeNull();
      expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["openMenu"]);
    });

    test("leaves the layouts on screen outside a view", async () => {
      const tabs = layoutOf(({ children }) => (
        <div>
          <Chrome />
          {children}
        </div>
      ));
      const container = await mount([tabs, page]);

      expect(isShown(container.querySelector("nav"))).toBe(true);
      expect(container.querySelector("nav")?.getAttribute("data-hidden-chrome")).toBe("false");
      expect(isShown(container.querySelector("p"))).toBe(true);
    });
  });
});
