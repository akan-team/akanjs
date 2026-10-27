import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getApiPrefix } from "akanjs/base";
import { Logger } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { AkanLib, AkanOption } from "akanjs/server";
import {
  type DatabaseSignal,
  endpoint,
  type Guard,
  type GuardScope,
  internal,
  middleware,
  None,
  Public,
  type SignalContext,
  SignalRegistry,
  serverSignal,
  slice,
} from "akanjs/signal";
import {
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel as srv,
} from "../server/resolver/resolver.contract.fixture";
import { TestServer } from "./testServer";

class BearerAccount extends middleware("bearerAccount") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const { req } = context.getHttpContext<{ account?: { id: string } }>();
      const id = req.headers.get("authorization")?.replace(/^Bearer /, "");
      Object.assign(req, { account: id ? { id } : undefined });
      return await next();
    };
  }
}

class Member implements Guard {
  static name = "Member";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return !!context.get<{ id?: string }>("account");
  }
}

class LibItemSlice extends slice(
  srv,
  { guards: { root: Public, get: Public, cru: Member }, mcp: { remove: false } },
  () => ({}),
) {}
class LibItemEndpoint extends endpoint(srv, (builder) => ({
  libGreet: builder.query(String, { guards: [Public] }).exec(() => "lib"),
})) {}
class LibItemInternal extends internal(srv, () => ({})) {}
const libItem = SignalRegistry.registerDatabase(
  "serverResolverTestItem",
  LibItemInternal,
  LibItemEndpoint,
  LibItemSlice,
  serverSignal(LibItemEndpoint, LibItemInternal),
  "testLib",
);

class AppItemSlice extends slice(
  srv,
  { guards: { root: Public, get: Public, cru: Member, create: None } },
  () => ({}),
  LibItemSlice,
) {}
class AppItemEndpoint extends endpoint(srv, (builder) => ({
  greet: builder.query(String, { guards: [Public] }).exec(() => "hello"),
  quietGreet: builder.query(String, { guards: [Public] }).exec(() => "still served"),
  memberGreet: builder.query(String, { guards: [Member] }).exec(() => "member"),
})) {}
class AppItemInternal extends internal(srv, () => ({})) {}
const appItem = SignalRegistry.registerDatabase(
  "serverResolverTestItem",
  AppItemInternal,
  AppItemEndpoint,
  AppItemSlice,
  serverSignal(AppItemEndpoint, AppItemInternal),
  "testApp",
);

const moduleOf = (signal: DatabaseSignal) => ({
  constant: serverResolverTestConstant,
  database: serverResolverTestDatabase,
  service: srv,
  signal,
});
const lib = new AkanLib("testLib", {
  databases: [moduleOf(libItem)],
  services: [],
  scalars: [],
  option: new AkanOption().setMcp({ excludeEndpoints: ["greet"] }),
});
const app = new AkanLib("testApp", {
  databases: [moduleOf(appItem)],
  services: [],
  scalars: [],
  option: new AkanOption()
    .applyMiddleware(BearerAccount)
    .setMcp({ excludeEndpoints: ["quietGreet", "quietGret"], excludeSignals: ["serverResolverTestItme"] }),
});

const server = new TestServer(
  {
    repoName: "akan",
    serveDomain: "example.com",
    appName: "testServerMcp",
    environment: "testing",
    operationMode: "local",
  },
  [lib, app],
);
const bootLines: string[] = [];

beforeAll(async () => {
  const stop = Logger.addSink(({ message }) => void bootLines.push(message));
  try {
    await server.init();
  } finally {
    stop();
  }
});

afterAll(async () => {
  await server.terminate();
});

describe("TestServer served MCP catalogue", () => {
  test("lists what /mcp lists an anonymous caller, and more for a signed-in one", async () => {
    const anonymous = await server.servedMcpCatalogue();
    const member = await server.servedMcpCatalogue({ as: { fetch: { jwt: "u1" } } });
    const names = (catalogue: typeof anonymous) => catalogue.tools.map((tool) => tool.name);
    expect(names(anonymous)).toContain("serverResolverTestItem");
    expect(names(anonymous)).not.toContain("memberGreet");
    expect(names(anonymous)).not.toContain("updateServerResolverTestItem");
    expect(names(member)).toContain("memberGreet");
    expect(names(member)).toContain("updateServerResolverTestItem");
    expect(member.findTool("memberGreet")?.refName).toBe("serverResolverTestItem");
    expect(anonymous.findTool("memberGreet")).toBeUndefined();
    expect(member.listingCost.bytes).toBeGreaterThan(anonymous.listingCost.bytes);
  });

  test("lists no generated verb the app's slice denies or the lib's slice took off the shelf", async () => {
    const member = await server.servedMcpCatalogue({ as: { jwt: "u1" } });
    const names = member.tools.map((tool) => tool.name);
    expect(names).not.toContain("createServerResolverTestItem");
    expect(names).not.toContain("removeServerResolverTestItem");
  });

  test("lists the text-only view by default, and the same with `ui` on a server that draws no MCP Apps views", async () => {
    const text = await server.servedMcpCatalogue({ as: { jwt: "u1" } });
    const ui = await server.servedMcpCatalogue({ as: { jwt: "u1" }, ui: true });
    expect(ui.tools.map((tool) => tool.name)).toEqual(text.tools.map((tool) => tool.name));
  });

  test("merges the client the way the server mounts: the app's `None` denies, the lib's mcp map holds", () => {
    const client = FetchClient.from(libItem, appItem);
    const merged = client.instance.serializedSignal.serverResolverTestItem;
    expect(merged?.createGuards).toEqual(["None"]);
    expect("createServerResolverTestItem" in client.instance.handler).toBe(false);
    const generated = FetchClient.getBaseEndpoint("serverResolverTestItem", merged ?? appItem.serializedSignal);
    expect(generated.createServerResolverTestItem).toBeUndefined();
    expect(generated.removeServerResolverTestItem?.mcp).toBe(false);
    expect(generated.updateServerResolverTestItem?.mcp).toBeUndefined();
  });

  test("keeps the app's slice when the lib's own bundle is applied after the app's, as a tab may evaluate them", () => {
    const appBundle = FetchClient.from(libItem, appItem).ownSerializedSignal;
    const libBundle = FetchClient.from(libItem).ownSerializedSignal;
    expect(appBundle.serverResolverTestItem?.origin).toEqual(["testLib", "testApp"]);
    const client = new FetchClient("", {}, appBundle).applySignal(libBundle);
    expect(client.serializedSignal.serverResolverTestItem?.createGuards).toEqual(["None"]);
    expect("createServerResolverTestItem" in client.handler).toBe(false);
  });

  test("keeps every module's exclusions off /mcp while HTTP still answers them", async () => {
    const names = (await server.servedMcpCatalogue()).tools.map((tool) => tool.name);
    expect(names).not.toContain("greet");
    expect(names).not.toContain("quietGreet");
    const response = await fetch(
      `http://127.0.0.1:${process.env.PORT}${getApiPrefix()}/serverResolverTestItem/quietGreet`,
    );
    expect(await response.json()).toBe("still served");
  });

  test("warns at boot about each exclusion that matches nothing", () => {
    expect(bootLines.find((line) => line.includes("excludeSignals names"))).toContain('"serverResolverTestItme"');
    expect(bootLines.find((line) => line.includes("excludeEndpoints names"))).toContain('"quietGret"');
  });
});
