import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

let RecentTime: typeof import("./RecentTime").RecentTime;
let dayjs: typeof import("akanjs/base").dayjs;
let lang = "en";

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "recenttimetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "recenttimetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang, l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ RecentTime } = await import("./RecentTime"));
  ({ dayjs } = await import("akanjs/base"));
});

const render = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    text: () => container.textContent ?? "",
    label: () => container.querySelector("[role=tooltip]")?.previousElementSibling?.textContent ?? "",
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
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
