import "../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { Dayjs } from "akanjs/base";
import { act, type ReactNode, Suspense } from "react";
import { createRoot } from "react-dom/client";

let DatePicker: typeof import("./DatePicker").DatePicker;
let dayjs: typeof import("akanjs/base").dayjs;
const warnings: string[] = [];

/** happy-dom's dispatch does not reach React's synthetic events, so the handler is called through its props. */
const typeInto = async (input: HTMLInputElement, value: string) => {
  const key = Object.keys(input).find((name) => name.startsWith("__reactProps$")) ?? "";
  const props = (input as unknown as Record<string, { onChange: (event: unknown) => void }>)[key];
  input.value = value;
  await act(async () => {
    props.onChange({ target: input });
  });
};

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "datepickertest";
  process.env.AKAN_PUBLIC_REPO_NAME = "datepickertest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    msg: {
      warning: (key: string) => {
        warnings.push(key);
      },
    },
  } as never);
  ({ dayjs } = await import("akanjs/base"));
  ({ DatePicker } = await import("./DatePicker"));
});

/** The value one `onChange` was handed, read out before it is dereferenced. */
const changedTo = <T,>(onChange: { mock: { calls: unknown[][] } }): T => {
  const [call] = onChange.mock.calls;
  if (!call) throw new Error("onChange was never called");
  return call[0] as T;
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Suspense>{node}</Suspense>);
  });
  const input = (index = 0) => [...container.querySelectorAll("input")][index] as HTMLInputElement;
  return { input, unmount: () => act(() => root.unmount()) };
};

describe("DatePicker", () => {
  test("renders the browser's own date field and reports the day it was given", async () => {
    const onChange = mock((_value: unknown) => undefined);
    const { input, unmount } = await mount(<DatePicker value={dayjs("2026-08-30")} onChange={onChange} />);

    expect(input().type).toBe("date");
    expect(input().value).toBe("2026-08-30");

    await typeInto(input(), "2026-09-01");
    // Parsed as local midnight, which is the wall clock the field showed — not a UTC instant a zone would shift.
    expect(changedTo<Dayjs>(onChange).format("YYYY-MM-DD HH:mm")).toBe("2026-09-01 00:00");
    unmount();
  });

  test("carries the clock through the field when time is asked for", async () => {
    const onChange = mock((_value: unknown) => undefined);
    const { input, unmount } = await mount(
      <DatePicker showTime value={dayjs("2026-08-30T14:37")} onChange={onChange} />,
    );

    expect(input().type).toBe("datetime-local");
    expect(input().value).toBe("2026-08-30T14:37");

    await typeInto(input(), "2026-08-30T09:05");
    expect(changedTo<Dayjs>(onChange).format("HH:mm")).toBe("09:05");
    unmount();
  });

  test("hands min and max to the browser, which is what actually enforces them", async () => {
    const { input, unmount } = await mount(
      <DatePicker
        value={dayjs("2026-08-30")}
        min={dayjs("2026-08-01")}
        max={dayjs("2026-08-31")}
        onChange={() => undefined}
      />,
    );

    expect(input().getAttribute("min")).toBe("2026-08-01");
    expect(input().getAttribute("max")).toBe("2026-08-31");
    unmount();
  });

  test("refuses a day the caller disallows and puts the field back", async () => {
    const onChange = mock((_value: unknown) => undefined);
    warnings.length = 0;
    const { input, unmount } = await mount(
      <DatePicker value={dayjs("2026-08-30")} disabledDate={(date) => date.day() === 0} onChange={onChange} />,
    );

    // A native field constrains only through min/max, so the predicate is checked after the pick — and the
    // field has to be restored by hand, since the value React would re-render is the one already there.
    await typeInto(input(), "2026-09-06");
    expect(onChange).not.toHaveBeenCalled();
    expect(warnings).toEqual(["base.selectDateError"]);
    expect(input().value).toBe("2026-08-30");

    await typeInto(input(), "2026-09-07");
    expect(onChange).toHaveBeenCalled();
    unmount();
  });

  test("range picker bounds each end by the other", async () => {
    const onChange = mock((_value: unknown) => undefined);
    const { input, unmount } = await mount(
      <DatePicker.RangePicker value={[dayjs("2026-08-01"), dayjs("2026-08-31")]} onChange={onChange} />,
    );

    expect(input(0).getAttribute("max")).toBe("2026-08-31");
    expect(input(1).getAttribute("min")).toBe("2026-08-01");

    await typeInto(input(0), "2026-08-10");
    const [start, end] = changedTo<[Dayjs, Dayjs]>(onChange);
    expect(start.format("YYYY-MM-DD")).toBe("2026-08-10");
    expect(end.format("YYYY-MM-DD")).toBe("2026-08-31");
    unmount();
  });

  test("time picker keeps the day it was holding", async () => {
    const onChange = mock((_value: unknown) => undefined);
    const { input, unmount } = await mount(
      <DatePicker.TimePicker value={dayjs("2026-08-30T14:37")} onChange={onChange} />,
    );

    expect(input().type).toBe("time");
    expect(input().value).toBe("14:37");

    // The field reports a clock reading with no date in it; the day has to come from the value being edited.
    await typeInto(input(), "09:05");
    expect(changedTo<Dayjs>(onChange).format("YYYY-MM-DD HH:mm")).toBe("2026-08-30 09:05");
    unmount();
  });
});
