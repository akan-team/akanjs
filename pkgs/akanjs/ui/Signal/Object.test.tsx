import { beforeAll, describe, expect, test } from "bun:test";
import type { ConstantCls, ConstantField, FieldInfoObject } from "akanjs/constant";
import type { ReactElement } from "react";

let UiObject: typeof import("./Object").default;
let render: (element: ReactElement) => Promise<string>;
let MapObjectFull: ConstantCls;

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "signalobjecttest";
  process.env.AKAN_PUBLIC_REPO_NAME = "signalobjecttest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { FIELD_META, Int } = await import("akanjs/base");
  const { ConstantRegistry, field } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { renderToReadableStream } = await import("react-dom/server");
  UiObject = (await import("./Object")).default;
  render = async (element) => await new Response(await renderToReadableStream(element)).text();
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);

  const makeRef = (fields: FieldInfoObject | Record<string, ConstantField>): ConstantCls => {
    class TestConstant {}
    Object.assign(TestConstant, {
      [FIELD_META]: Object.fromEntries(
        Object.entries(fields).map(([key, info]) => [key, "toField" in info ? info.toField() : info]),
      ),
      children: new Set(),
      relations: new Set(),
      enums: new Set(),
      text: { search: new Set(), filter: new Set(), children: { search: new Set(), filter: new Set() } },
    });
    return TestConstant as ConstantCls;
  };
  const mapFields = { name: field(String), prompts: field(Map, { of: String }) };
  MapObjectFull = makeRef(mapFields);
  ConstantRegistry.buildModel(
    "mapObject",
    makeRef(mapFields) as never,
    makeRef(mapFields) as never,
    MapObjectFull as never,
    makeRef(mapFields) as never,
    makeRef({ total: field(Int, { default: 0 }) }) as never,
    {},
  );
});

describe("Signal.Object.Detail", () => {
  test("names a Map field instead of asking the registry to name the Map constructor", async () => {
    const html = await render(<UiObject.Detail objRef={MapObjectFull} />);
    expect(html).toContain("prompts");
    expect(html).toContain("Map!");
    expect(html).toContain("String");
  });
});
