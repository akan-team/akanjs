import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { mount, setTestEnv } from "./testHelpers.fixture";

let RecentTime: typeof import("./RecentTime").RecentTime;
let dayjs: typeof import("akanjs/base").dayjs;
let lang = "en";

beforeAll(async () => {
  setTestEnv("recenttimetest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang, l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ RecentTime } = await import("./RecentTime"));
  ({ dayjs } = await import("akanjs/base"));
});

const render = (node: ReactNode) => {
  const { container, unmount } = mount(node);
  return {
    text: () => container.textContent ?? "",
    // The tooltip's bubble opens on the overlay layer, so the component's own text is the label alone.
    label: () => container.textContent ?? "",
    unmount,
  };
};

describe("RecentTime", () => {
  test("renders nothing for a null date and --:-- for epoch placeholders", () => {
    const empty = render(<RecentTime date={null} />);
    expect(empty.text()).toBe("");
    empty.unmount();
    const epoch = render(<RecentTime date={dayjs(0)} />);
    expect(epoch.text()).toBe("--:--");
    epoch.unmount();
  });

  test("relative auto uses calendar phrasing (yesterday / 어제)", () => {
    lang = "en";
    const en = render(<RecentTime date={dayjs().subtract(1, "day")} relative="auto" />);
    expect(en.label()).toBe("yesterday");
    en.unmount();
    lang = "ko";
    const ko = render(<RecentTime date={dayjs().subtract(1, "day")} relative="auto" />);
    expect(ko.label()).toBe("어제");
    ko.unmount();
    lang = "en";
  });

  test("relative always uses numeric phrasing (1 day ago / 1일 전)", () => {
    lang = "en";
    const en = render(<RecentTime date={dayjs().subtract(1, "day")} relative="always" />);
    expect(en.label()).toBe("1 day ago");
    en.unmount();
    lang = "ko";
    const ko = render(<RecentTime date={dayjs().subtract(1, "day")} relative="always" />);
    expect(ko.label()).toBe("1일 전");
    ko.unmount();
    lang = "en";
  });

  test("default relative keeps the dayjs fromNow phrasing", () => {
    lang = "en";
    const view = render(<RecentTime date={dayjs().subtract(1, "day")} />);
    expect(view.label()).toBe("a day ago");
    view.unmount();
  });

  test("a relative function replaces the label and receives the resolved unit", () => {
    const date = dayjs().subtract(1, "day");
    let unit = "";
    let count = 0;
    const view = render(
      <RecentTime
        date={date}
        relative={(relative) => {
          unit = relative.unit;
          count = relative.count;
          return `${Math.abs(relative.count)}일전`;
        }}
      />,
    );
    expect(view.label()).toBe("1일전");
    expect(unit).toBe("day");
    expect(count).toBe(-1);
    view.unmount();
  });
});
