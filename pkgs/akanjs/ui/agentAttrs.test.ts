import { beforeAll, describe, expect, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.browser";

let html: string;
let plainHtml: string;

/** Imported after the environment is set: the `akanjs/store` barrel calls `getEnv()` while it is still evaluating. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "attrtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "attrtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";

  const [{ Int, SLICE_META }, { ConstantRegistry, via }, storeFacet, { registerClientRuntime }, { Input }] =
    await Promise.all([
      import("akanjs/base"),
      import("akanjs/constant"),
      import("akanjs/store"),
      import("akanjs/client/clientRuntime"),
      import("./Input"),
    ]);
  const { store, StoreInstance, StoreRegistry } = storeFacet;
  // `Input` localizes its own validation message through `usePage()`, which needs the generated app client.
  registerClientRuntime({ usePage: () => ({ l: (key: string) => key }) } as never);

  const AttrInput = via((f) => ({ nickname: f(String), age: f(Int, { default: 0 }) }));
  const AttrObject = via(AttrInput, () => ({}));
  const AttrLight = via(AttrObject, ["nickname"] as const, () => ({}));
  const AttrFull = via(AttrObject, AttrLight, () => ({}));
  const AttrInsight = via(AttrFull, (f) => ({ count: f(Int, { default: 0 }) }));
  const cnst = ConstantRegistry.buildModel("attrMember", AttrInput, AttrObject, AttrFull, AttrLight, AttrInsight, {
    AttrInput,
    AttrObject,
    AttrFull,
    AttrLight,
    AttrInsight,
  });

  const handlers: Record<string, unknown> = {};
  const signal = {
    refName: "attrMember",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) }),
    serializedSignal: { prefix: "attrMember", cruGuards: ["SignedIn"], endpoint: {}, slice: {} },
    slices: [],
  } as unknown as ClientSignal<"attrMember">;

  class MemberStore extends store(signal, () => ({})) {}
  StoreRegistry.register(MemberStore);
  const st = new StoreInstance(StoreRegistry.merge("attrRoot", MemberStore));

  const render = async (onChange: unknown) =>
    new Response(await renderToReadableStream(createElement(Input, { value: "", onChange } as never))).text();
  // The house form for a model field — the setter itself, nothing else written by the app.
  html = await render(st.do.setNicknameOnAttrMember);
  plainHtml = await render((value: string) => value);
});

describe("agentAttrs", () => {
  test("a setter passed by reference names itself and the state it writes, with no app code", () => {
    expect(html).toContain('data-akan-action="setNicknameOnAttrMember"');
    expect(html).toContain('data-akan-state="attrMemberForm.nickname"');
  });

  test("an inline closure gets no attributes, because it says nothing about what it does", () => {
    expect(plainHtml).not.toContain("data-akan-action");
  });
});
