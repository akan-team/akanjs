import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, Profiler, useState } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { mount, setTestEnv } from "../testHelpers.fixture";
import type { PanelProps } from "./Provider";

let Tab: typeof import("./index").Tab;

beforeAll(async () => {
  setTestEnv("tabtest");
  ({ Tab } = await import("./index"));
});

/** happy-dom's dispatch never reaches a React synthetic handler; the fiber props are where the click actually is. */
const clickReact = (container: HTMLElement, text: string) => {
  for (const el of container.querySelectorAll("button, div, a")) {
    if (el.textContent !== text) continue;
    const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
    const props = key ? (el as unknown as { [key: string]: { onClick?: () => void } })[key] : undefined;
    if (!props?.onClick) continue;
    act(() => props.onClick?.());
    return true;
  }
  return false;
};

const tabs = (surface: AgenticSurface, namespace?: string) => (
  <AgentProvider surface={surface}>
    <Tab defaultMenu="spec" namespace={namespace}>
      <Tab.Menus>
        <Tab.Menu menu="spec">Spec</Tab.Menu>
        <Tab.Menu menu="review">Review</Tab.Menu>
        <Tab.Menu menu="history" disabled>
          History
        </Tab.Menu>
      </Tab.Menus>
      <Tab.Panel menu="spec">spec body</Tab.Panel>
      <Tab.Panel menu="review">review body</Tab.Panel>
    </Tab>
  </AgentProvider>
);

type PanelLoading = NonNullable<PanelProps["loading"]>;
let setReviewLoading: (loading: PanelLoading) => void = () => undefined;
const ReviewLoadingHost = ({ initial }: { initial: PanelLoading }) => {
  const [loading, setLoading] = useState(initial);
  setReviewLoading = setLoading;
  return (
    <AgentProvider surface={new AgenticSurface()}>
      <Tab defaultMenu="spec">
        <Tab.Menus>
          <Tab.Menu menu="spec">Spec</Tab.Menu>
          <Tab.Menu menu="review">Review</Tab.Menu>
        </Tab.Menus>
        <Tab.Panel menu="spec">spec body</Tab.Panel>
        <Tab.Panel menu="review" loading={loading}>
          review body
        </Tab.Panel>
      </Tab>
    </AgentProvider>
  );
};
const loadReview = (loading: PanelLoading) => act(() => setReviewLoading(loading));

describe("Tab", () => {
  test("publishes its menus and the switch its own buttons dispatch", async () => {
    const surface = new AgenticSurface();
    const { container, unmount } = mount(tabs(surface, "detail"));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["switchTabInDetail"]);
    expect(surface.read("tabsInDetail")).toEqual({
      current: "spec",
      menus: [{ menu: "spec" }, { menu: "review" }, { menu: "history", disabled: true }],
    });
    expect(container.querySelectorAll('[data-akan-action="switchTabInDetail"]')).toHaveLength(3);

    await act(async () => {
      await surface.call("switchTabInDetail", { menu: "review" });
    });
    expect(container.querySelector("[data-menu]")?.getAttribute("data-menu")).toBe("review");
    unmount();
  });

  test("refuses a menu this tab does not offer, and one it draws as disabled", async () => {
    const surface = new AgenticSurface();
    const { unmount } = mount(tabs(surface, "detail"));

    await expect(surface.call("switchTabInDetail", { menu: "billing" })).rejects.toThrow(
      'No menu "billing" on this tab. It offers: spec, review, history.',
    );
    await expect(surface.call("switchTabInDetail", { menu: "history" })).rejects.toThrow(
      'The menu "history" is disabled.',
    );
    unmount();
  });

  test("without a namespace it publishes nothing and the buttons still switch", () => {
    const surface = new AgenticSurface();
    const { container, unmount } = mount(tabs(surface));

    expect(surface.snapshot().tools).toHaveLength(0);
    expect(surface.snapshot().resources).toHaveLength(0);
    expect(container.querySelector("[data-akan-action]")).toBeNull();

    expect(clickReact(container, "Review")).toBe(true);
    expect(container.querySelector("[data-menu]")?.getAttribute("data-menu")).toBe("review");
    unmount();
  });

  test("a hidden panel unmounts the moment its loading turns to every, and mounts again for eager", () => {
    const { container, unmount } = mount(<ReviewLoadingHost initial="eager" />);
    expect(container.textContent).toContain("review body");

    loadReview("every");
    expect(container.textContent).not.toContain("review body");
    loadReview("eager");
    expect(container.textContent).toContain("review body");
    unmount();
  });

  test("a panel turned lazy keeps what it had mounted, and mounts on its first selection", () => {
    const { container, unmount } = mount(<ReviewLoadingHost initial="eager" />);
    loadReview("lazy");
    expect(container.textContent).toContain("review body");
    loadReview("every");
    loadReview("lazy");
    expect(container.textContent).not.toContain("review body");

    expect(clickReact(container, "Review")).toBe(true);
    expect(container.textContent).toContain("review body");
    expect(clickReact(container, "Spec")).toBe(true);
    expect(container.textContent).toContain("review body");
    unmount();
  });

  test("an every panel is on screen in the same commit that selects its menu", () => {
    const commits: { menu: string | null; hasReview: boolean }[] = [];
    let probed: HTMLElement | null = null;
    const { container, unmount } = mount(
      <Profiler
        id="tab"
        onRender={() => {
          commits.push({
            menu: probed?.querySelector("[data-menu]")?.getAttribute("data-menu") ?? null,
            hasReview: probed?.textContent?.includes("review body") ?? false,
          });
        }}
      >
        <ReviewLoadingHost initial="every" />
      </Profiler>,
    );
    probed = container;
    expect(clickReact(container, "Review")).toBe(true);
    const reviewCommits = commits.filter(({ menu }) => menu === "review");
    expect(reviewCommits.length).toBeGreaterThan(0);
    expect(reviewCommits.every(({ hasReview }) => hasReview)).toBe(true);
    unmount();
  });
});
