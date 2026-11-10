import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { router } from "akanjs/client";
import { act, Component, type ReactNode, use } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RouteLevelBoundary } from "./RouteLevelBoundary";

const rejected = (error: Error) => {
  const promise = Promise.reject(error);
  promise.catch(() => undefined);
  return promise;
};
const streamedError = (digest: string) => Object.assign(new Error("server broke"), { digest });
const Reads = ({ of }: { of: Promise<string> }) => <b>{use(of)}</b>;

class Outer extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    return this.state.error ? <p id="outer">outer caught</p> : this.props.children;
  }
}

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
});

let mounted: { root: Root; container: HTMLElement } | null = null;
const mount = async (node: ReactNode, uncaught: unknown[] = []) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container, { onUncaughtError: (error) => void uncaught.push(error) });
  mounted = { root, container };
  await act(async () => {
    root.render(node);
  });
  await act(async () => {});
  return {
    container,
    rerender: async (next: ReactNode) => {
      await act(async () => {
        root.render(next);
      });
      await act(async () => {});
    },
  };
};

const unmount = async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = null;
};
afterEach(unmount);

describe("RouteLevelBoundary", () => {
  test("draws the route-level notice for an error the server streamed, whose retry refreshes the router", async () => {
    let refreshed = 0;
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: () => undefined,
        back: () => undefined,
        refresh: () => void refreshed++,
      },
    });
    const { container } = await mount(
      <main>
        <aside id="beside">beside</aside>
        <RouteLevelBoundary>
          <Reads of={rejected(streamedError("a1b2c3d4"))} />
        </RouteLevelBoundary>
      </main>,
    );
    expect(container.querySelector("#beside")?.textContent).toBe("beside");
    const notice = container.querySelector('main > [role="alert"]');
    expect(notice?.querySelector("p")?.textContent).toBe("base.pageLoadFailed");
    await act(async () => {
      notice?.querySelector("button")?.click();
    });
    expect(refreshed).toBe(1);
  });

  test("draws nothing for a not-found or redirect the server raised below the route, which the host answers", async () => {
    for (const digest of ["AKAN_NOT_FOUND", "AKAN_REDIRECT;replace;307;%2Fen%2Ftarget"]) {
      const { container } = await mount(
        <main>
          <aside>beside</aside>
          <RouteLevelBoundary>
            <Reads of={rejected(streamedError(digest))} />
          </RouteLevelBoundary>
        </main>,
      );
      expect(container.textContent).toBe("beside");
      await unmount();
    }
  });

  test("passes a client render error with no digest on, exactly as it went without the boundary", async () => {
    const bug = new Error("render bug");
    const Throws = () => {
      throw bug;
    };
    const named = (error: unknown) => (error === bug ? "bug" : error);
    const outcome = async (node: ReactNode) => {
      const uncaught: unknown[] = [];
      const result = await mount(node, uncaught).then(
        ({ container }) => ({ html: container.innerHTML }),
        (error: unknown) => ({ thrown: named(error) }),
      );
      await unmount();
      return { ...result, uncaught: uncaught.map(named) };
    };
    const without = await outcome(<Throws />);
    expect(without).toEqual({ thrown: "bug", uncaught: [] });
    expect(
      await outcome(
        <RouteLevelBoundary>
          <Throws />
        </RouteLevelBoundary>,
      ),
    ).toEqual(without);

    const caught = await mount(
      <Outer>
        <RouteLevelBoundary>
          <Throws />
        </RouteLevelBoundary>
      </Outer>,
    );
    expect(caught.container.querySelector("#outer")).not.toBeNull();
    expect(caught.container.querySelector('[role="alert"]')).toBeNull();
  });

  test("renders the level again when a new payload hands it new children", async () => {
    const level = (of: Promise<string>) => (
      <RouteLevelBoundary>
        <Reads of={of} />
      </RouteLevelBoundary>
    );
    const { container, rerender } = await mount(level(rejected(streamedError("a1b2c3d4"))));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await rerender(level(Promise.resolve("reloaded")));
    expect(container.textContent).toBe("reloaded");
  });
});
