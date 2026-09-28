import { beforeAll, describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setTestEnv } from "../testHelpers.fixture";

let convToAntdColumn: typeof import("./Item").convToAntdColumn;

beforeAll(async () => {
  setTestEnv("itemcolumntest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ convToAntdColumn } = await import("./Item"));
});

const cellOf = (column: Parameters<typeof convToAntdColumn>[0], value: unknown) => {
  const { render } = convToAntdColumn(column);
  return renderToStaticMarkup(<>{(render ? render(value as never, {} as never) : value) as ReactNode}</>);
};

describe("convToAntdColumn", () => {
  test("renders a date field by its value, whatever the column is named", () => {
    const grantedAt = dayjs("2020-01-02T03:04:05Z");
    expect(() => cellOf("grantedAt", grantedAt)).not.toThrow();
    expect(cellOf("grantedAt", grantedAt)).toBe(cellOf("createdAt", grantedAt).replace(/^<div>|<\/div>$/g, ""));
    expect(cellOf({ key: "expireAt" }, grantedAt.toDate())).not.toContain("$isDayjsObject");
  });

  test("prints any other value as text, and keeps a column's own renderer", () => {
    expect(cellOf("productId", "prod-1")).toBe("prod-1");
    expect(cellOf("membershipDays", 30)).toBe("30");
    expect(cellOf("luna", null)).toBe("");
    expect(cellOf({ key: "luna", render: (value: number) => `${value} L` }, 5)).toBe("5 L");
  });
});
