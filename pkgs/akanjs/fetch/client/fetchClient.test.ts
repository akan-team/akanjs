import { beforeEach, describe, expect, test } from "bun:test";
import { ConstantRegistry, via } from "akanjs/constant";
import type { DatabaseSignal, SerializedSignal } from "akanjs/signal";
import { AppScope } from "../appScope";
import { RenderScope } from "../renderScope";
import { FetchClient } from "./fetchClient";
import type { RestoredError } from "./remoteError";

const root = { args: [], guards: ["Public"] };
const libWidget = (): SerializedSignal => ({
  prefix: "widget",
  slice: { "": root },
  getGuards: ["Public"],
  cruGuards: ["Admin"],
  createGuards: ["Admin", "Owner"],
  mcp: { update: false },
  endpoint: { countWidgets: { type: "query", args: [], returns: { refName: "Int" }, guards: ["Public"] } },
});
const appWidget = (facts: Partial<SerializedSignal> = {}): SerializedSignal => ({
  prefix: "widget",
  slice: { "": root },
  getGuards: ["Public"],
  endpoint: {},
  ...facts,
});
const moduleOf = (serializedSignal: SerializedSignal) =>
  ({ endpoint: { baseName: "widget" }, serializedSignal }) as unknown as DatabaseSignal;
const callable = (client: { instance: FetchClient }, key: string) => key in client.instance.handler;

beforeEach(() => {
  FetchClient.resetSharedRegistry();
});

describe("FetchClient merging a later module's slice", () => {
  test("takes the later slice's guards and verb maps whole, never field by field", () => {
    const client = FetchClient.from(moduleOf(libWidget()), moduleOf(appWidget({ cruGuards: ["Admin"] })));
    const merged = client.instance.serializedSignal.widget;
    expect(merged?.cruGuards).toEqual(["Admin"]);
    expect(merged?.createGuards).toBeUndefined();
    expect(merged?.mcp).toBeUndefined();
    expect(merged?.endpoint.countWidgets).toBeDefined();
    expect(FetchClient.getBaseEndpoint("widget", merged ?? appWidget()).createWidget?.guards).toEqual(["Admin"]);
  });

  test("registers no generated verb a `['None']` list denies", () => {
    const client = FetchClient.from(moduleOf(libWidget()), moduleOf(appWidget({ cruGuards: ["None"] })));
    expect(callable(client, "createWidget")).toBe(false);
    expect(callable(client, "updateWidget")).toBe(false);
    expect(callable(client, "removeWidget")).toBe(false);
    expect(callable(client, "editWidget")).toBe(false);
    expect(callable(client, "widget")).toBe(true);
    expect(callable(client, "countWidgets")).toBe(true);
  });

  test("takes back a verb the lib's signal registered when the later one, applied after, denies it", () => {
    const client = FetchClient.from(moduleOf(libWidget()));
    expect(callable(client, "createWidget")).toBe(true);
    client.instance.applySignal({ widget: appWidget({ cruGuards: ["None"], createGuards: ["Admin"] }) });
    expect(callable(client, "createWidget")).toBe(true);
    expect(callable(client, "updateWidget")).toBe(false);
    expect(callable(client, "mergeWidget")).toBe(false);
    client.instance.applySignal({ widget: appWidget({ cruGuards: ["None"] }) });
    expect(callable(client, "createWidget")).toBe(false);
  });

  test("keeps the slice facts when the later signal carries no slice", () => {
    const client = FetchClient.from(moduleOf(libWidget()), moduleOf({ endpoint: {} }));
    const merged = client.instance.serializedSignal.widget;
    expect(merged?.createGuards).toEqual(["Admin", "Owner"]);
    expect(merged?.mcp).toEqual({ update: false });
  });

  test("still mounts a verb whose list names a guard beside None, as the server does", () => {
    const endpoint = FetchClient.getBaseEndpoint("widget", appWidget({ cruGuards: ["Admin", "None"] }));
    expect(endpoint.createWidget?.guards).toEqual(["Admin", "None"]);
  });
});

describe("FetchClient applying a lib's signal after the app's, which already merged that lib", () => {
  const libOf = (): SerializedSignal => ({ ...libWidget(), origin: ["lib"] });
  const appOf = (facts: Partial<SerializedSignal> = {}): SerializedSignal => ({
    ...appWidget({ cruGuards: ["None"], ...facts }),
    origin: ["app"],
  });
  const appBundle = (facts: Partial<SerializedSignal> = {}) =>
    FetchClient.from(moduleOf(libOf()), moduleOf(appOf(facts))).ownSerializedSignal;
  const libBundle = () => FetchClient.from(moduleOf(libOf())).ownSerializedSignal;
  const expectAppFacts = (client: FetchClient) => {
    const widget = client.serializedSignal.widget;
    expect(widget?.origin).toEqual(["lib", "app"]);
    expect(widget?.cruGuards).toEqual(["None"]);
    expect(widget?.createGuards).toBeUndefined();
    expect(widget?.mcp).toBeUndefined();
    expect(widget?.endpoint.countWidgets).toBeDefined();
    expect("createWidget" in client.handler).toBe(false);
    expect("mergeWidget" in client.handler).toBe(false);
    expect("countWidgets" in client.handler).toBe(true);
  };
  const tabOf = (...bundles: { [key: string]: SerializedSignal }[]) => {
    const { window } = globalThis as { window?: unknown };
    Object.assign(globalThis, { window: {} });
    try {
      for (const bundle of bundles) FetchClient.build({}, bundle, { origin: "https://tab.example" });
      return FetchClient.build({}, {}, { origin: "https://tab.example" }).fetch.instance as FetchClient;
    } finally {
      Object.assign(globalThis, { window });
      FetchClient.resetSharedClient();
    }
  };

  test("the tab-wide client ends on the app's slice whichever useClient evaluates first", () => {
    const [app, lib] = [appBundle(), libBundle()];
    FetchClient.resetSharedRegistry();
    expectAppFacts(tabOf(app, lib));
    FetchClient.resetSharedRegistry();
    expectAppFacts(tabOf(lib, app));
  });

  test("the app's server client ends on its own slice after syncing the process registry, in either order", () => {
    const [app, lib] = [appBundle(), libBundle()];
    FetchClient.resetSharedRegistry();
    const appFirst = new FetchClient("", {}, app);
    new FetchClient("", {}, lib);
    void appFirst.handler.aKeyNoClientHas;
    expectAppFacts(appFirst);
    expect(FetchClient.sharedSerializedSignal.widget?.cruGuards).toEqual(["None"]);

    FetchClient.resetSharedRegistry();
    new FetchClient("", {}, lib);
    const appLast = new FetchClient("", {}, app);
    new FetchClient("", {}, lib);
    void appLast.handler.aKeyNoClientHas;
    expectAppFacts(appLast);
    expect(FetchClient.sharedSerializedSignal.widget?.cruGuards).toEqual(["None"]);
  });

  test("takes the app's own signal applied again, so a re-evaluated module replaces its facts", () => {
    const client = new FetchClient("", {}, appBundle());
    client.applySignal(appBundle({ cruGuards: ["Admin"] }));
    expect(client.serializedSignal.widget?.cruGuards).toEqual(["Admin"]);
    expect("createWidget" in client.handler).toBe(true);
  });
});

describe("FetchClient syncing the process registry", () => {
  const gadgets = (): { [key: string]: SerializedSignal } => ({
    gadget: {
      prefix: "gadget",
      endpoint: { countGadgets: { type: "query", args: [], returns: { refName: "Int" }, guards: ["Public"] } },
    },
  });

  test("a client built after another still reaches what the earlier one shared", () => {
    const first = new FetchClient("", {}, gadgets());
    const last = new FetchClient("", {}, { widget: libWidget() });
    expect("countGadgets" in last.handler).toBe(true);
    expect(typeof last.handler.countGadgets).toBe("function");
    expect("countWidgets" in first.handler).toBe(true);
  });
});

describe("FetchClient registering an endpoint named like another model's generated one", () => {
  const content = (): SerializedSignal => ({
    prefix: "content",
    endpoint: { removeVersion: { type: "mutation", args: [], returns: { refName: "Boolean" }, guards: ["User"] } },
  });
  const versionOf = (facts: Partial<SerializedSignal> = {}): SerializedSignal => ({
    prefix: "version",
    slice: { "": { args: [], guards: ["None"] } },
    crud: { get: false, create: false, update: false, remove: false },
    endpoint: {},
    ...facts,
  });

  test("keeps it when that model's slice mounts no such verb, whichever module applies first", () => {
    const contentFirst = new FetchClient("", {}, { content: content(), version: versionOf() });
    expect(typeof contentFirst.handler.removeVersion).toBe("function");
    FetchClient.resetSharedRegistry();
    const versionFirst = new FetchClient("", {}, { version: versionOf(), content: content() });
    expect(typeof versionFirst.handler.removeVersion).toBe("function");
  });

  test("keeps it when that model's signal is applied again, as a later module or a registry sync does", () => {
    const client = new FetchClient("", {}, { content: content(), version: versionOf() });
    client.applySignal({ version: versionOf() });
    expect(typeof client.handler.removeVersion).toBe("function");
    new FetchClient("", {}, { version: versionOf() });
    void client.handler.aKeyNoClientHas;
    expect(typeof client.handler.removeVersion).toBe("function");
  });

  test("still takes back the model's own generated handler once a later signal denies the verb", () => {
    const client = new FetchClient("", {}, { version: versionOf({ crud: undefined, cruGuards: ["Admin"] }) });
    expect("removeVersion" in client.handler).toBe(true);
    client.applySignal({ version: versionOf() });
    expect("removeVersion" in client.handler).toBe(false);
  });
});

describe("FetchClient merging a model's fields", () => {
  const thrownBy = (call: () => unknown) => {
    try {
      void call();
    } catch (error) {
      return (error as RestoredError).error;
    }
    return null;
  };

  test("refuses as it is called, like every other write, inside a render or an app's load", () => {
    const WidgetInput = via((field) => ({ name: field(String) }));
    const WidgetObject = via(WidgetInput, () => ({}));
    const LightWidget = via(WidgetObject, ["name"] as const, () => ({}));
    class Widget extends via(WidgetObject, LightWidget, () => ({})) {}
    const WidgetInsight = via(Widget, () => ({}));
    ConstantRegistry.buildModel("widget", WidgetInput, WidgetObject, Widget, LightWidget, WidgetInsight, {});
    const merge = FetchClient.from(moduleOf(libWidget())).instance.handler.mergeWidget;
    const data = { name: "a" };
    expect(RenderScope.run(() => thrownBy(() => Promise.resolve(merge?.("w1", data)).catch(() => null)))).toBe(
      "base.error.mutationInRender",
    );
    expect(AppScope.run("showWidget", () => thrownBy(() => merge?.({ id: "w1" }, data)))).toBe(
      "base.error.mutationInApp",
    );
  });
});
