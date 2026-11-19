import { afterEach, describe, expect, test } from "bun:test";
import { FetchClient } from "akanjs/fetch";
import { AkanLib, AkanOption } from "akanjs/server";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint, internal, Public, SignalRegistry, serverSignal } from "akanjs/signal";
import { TestServer, type TestServerOptions } from "./testServer";

class GatedService extends serve("gated" as const, { enabled: false }, () => ({})) {}
const gatedSrv = ServiceModel.from(GatedService);
class GatedEndpoint extends endpoint(gatedSrv, (builder) => ({
  gatedGreet: builder.query(String, { guards: [Public] }).exec(() => "gated"),
  gatedSave: builder.mutation(String, { guards: [Public] }).exec(() => "saved"),
})) {}
class GatedInternal extends internal(gatedSrv, () => ({})) {}
const gated = SignalRegistry.registerService(
  "gated",
  GatedInternal,
  GatedEndpoint,
  serverSignal(GatedEndpoint, GatedInternal),
);
const lib = new AkanLib("gatedLib", {
  databases: [],
  services: [{ service: gatedSrv, signal: gated }],
  scalars: [],
  option: new AkanOption(),
});

type GatedFetch = { gatedGreet: () => Promise<string>; gatedSave: () => Promise<string> };

describe("TestServer gated modules", () => {
  let server: TestServer | undefined;
  const boot = async (options: TestServerOptions = {}) => {
    server = new TestServer(
      {
        repoName: "akan",
        serveDomain: "example.com",
        appName: "testServerGated",
        environment: "testing",
        operationMode: "local",
      },
      [lib],
      options,
    );
    await server.init();
    return FetchClient.from(gated) as unknown as GatedFetch;
  };

  afterEach(async () => {
    await server?.terminate();
    server = undefined;
  });

  test("names the module and why it is off when a test calls an endpoint the server did not mount", async () => {
    const fetch = await boot();
    const expected =
      '"gatedGreet" belongs to module "gated", which this server did not mount: service disabled. ' +
      'A signal test mounts it with configureSignalTest({ enableModules: ["gated"] }).';
    await expect(fetch.gatedGreet()).rejects.toMatchObject({
      error: expected,
      statusCode: 404,
      code: "moduleNotMounted",
    });
    await expect(fetch.gatedSave()).rejects.toMatchObject({ statusCode: 404, code: "moduleNotMounted" });
  });

  test("mounts a module `enableModules` names whatever its `enabled` says", async () => {
    const fetch = await boot({ enableModules: ["gated"] });
    expect(await fetch.gatedGreet()).toBe("gated");
    expect(await fetch.gatedSave()).toBe("saved");
  });
});
