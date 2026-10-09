import { beforeAll, describe, expect, test } from "bun:test";
import type { ConstantCls } from "akanjs/constant";
import type { ReactElement } from "react";
import { makeRef, setTestEnv } from "../testHelpers.fixture";

let ObjectDetail: typeof import("./Object").ObjectDetail;
let render: (element: ReactElement) => Promise<string>;
let MapObjectFull: ConstantCls;

beforeAll(async () => {
  setTestEnv("signalobjecttest");
  const { Int } = await import("akanjs/base");
  const { ConstantRegistry, field } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { renderToReadableStream } = await import("react-dom/server");
  ({ ObjectDetail } = await import("./Object"));
  render = async (element) => await new Response(await renderToReadableStream(element)).text();
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);

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
    const html = await render(<ObjectDetail objRef={MapObjectFull} />);
    expect(html).toContain("prompts");
    expect(html).toContain("Map!");
    expect(html).toContain("String");
  });
});
