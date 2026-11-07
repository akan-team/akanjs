import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setTestEnv } from "../testHelpers.fixture";

let convToAntdColumn: typeof import("./Item").convToAntdColumn;
let Item: typeof import("./Item").default;

beforeAll(async () => {
  setTestEnv("itemcolumntest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ convToAntdColumn, default: Item } = await import("./Item"));
});

const cellOf = (column: Parameters<typeof convToAntdColumn>[0], value: unknown) => {
  const { render } = convToAntdColumn(column);
  return renderToStaticMarkup((render ? render(value as never, {} as never) : value) as ReactNode);
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

describe("Data.Item", () => {
  const slice = { refName: "itemTestModel", sliceName: "itemTestModel", argLength: 0 };
  const model = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Ada", createdAt: dayjs("2020-01-02T03:04:05Z") };
  const cardOf = (columns: string[]) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <Item model={model} slice={slice} columns={columns} actions={["edit", "view"]} />,
    );
    const card = host.firstElementChild?.firstElementChild as HTMLElement;
    return { rows: [...card.children] as HTMLElement[], card };
  };

  test("puts the time beside the actions when it is all the header would hold", () => {
    const { rows, card } = cardOf(["name", "createdAt"]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Ada");
    expect(rows[1]?.children).toHaveLength(2);
    expect(rows[1]?.lastElementChild?.querySelectorAll("button")).toHaveLength(2);
    expect(card.className).not.toContain("mt-2");
  });

  test("keeps the time in the header beside an id", () => {
    const { rows } = cardOf(["id", "name", "createdAt"]);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("aaaa");
    expect(rows[2]?.children).toHaveLength(1);
  });
});
