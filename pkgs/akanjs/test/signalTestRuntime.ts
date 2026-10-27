import type { BackendEnv, BaseEnv } from "akanjs/base";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { AkanLib } from "akanjs/server";
import type { ServedMcpCatalogue } from "./ServedMcpCatalogue";
import { type McpCatalogueOptions, type TestEnv, TestServer, type TestServerOptions } from "./testServer";

export interface SignalTestTarget {
  type: "app" | "lib";
  name: string;
  env: TestEnv;
  fetch: FetchProxy;
  libs: AkanLib[];
}

export interface SignalTestContext<Fetch = FetchProxy> {
  fetch: Fetch;
  target: SignalTestTarget;
  server: TestServer;
  terminate: () => Promise<void>;
}

export type SignalTestOptions = Pick<TestServerOptions, "storage" | "workerId" | "port" | "serverMode">;

type SignalServerModule = {
  env?: BackendEnv;
  fetch: FetchProxy;
  lib: AkanLib;
};

let currentContext: SignalTestContext | undefined;
let pendingContext: Promise<SignalTestContext> | undefined;
let terminatingContext: Promise<void> | undefined;
let configuredOptions: SignalTestOptions = {};

export const hasSignalTestContext = () => currentContext !== undefined || pendingContext !== undefined;

export const getSignalTestContext = <Fetch = FetchProxy>() => {
  if (!currentContext)
    throw new Error("Signal test context is not initialized. Run through `akan test` or call setupSignalTestTarget().");
  return currentContext as SignalTestContext<Fetch>;
};

export const getSignalTestFetch = <Fetch = FetchProxy>() => getSignalTestContext<Fetch>().fetch;

/**
 * What the running test server's `/mcp` answers `tools/list` and `prompts/list` with, every page, for an anonymous
 * caller or `as` a test agent's account — dispatched through the server's own router, so no token is minted.
 */
export const getServedMcpCatalogue = async (options: McpCatalogueOptions = {}): Promise<ServedMcpCatalogue> =>
  await getSignalTestContext().server.servedMcpCatalogue(options);

export const getOrSetupSignalTestContext = async <Fetch = FetchProxy>() =>
  (await setupSignalTestTarget()) as SignalTestContext<Fetch>;

export const getOrSetupSignalTestFetch = async <Fetch = FetchProxy>() =>
  (await getOrSetupSignalTestContext<Fetch>()).fetch;

export const configureSignalTest = (options: SignalTestOptions) => {
  if (currentContext || pendingContext) {
    throw new Error("configureSignalTest() must be called before the signal test context is initialized.");
  }
  configuredOptions = { ...configuredOptions, ...options };
};

export const terminateSignalTestContext = async () => {
  if (terminatingContext) return terminatingContext;
  const context = currentContext;
  currentContext = undefined;
  pendingContext = undefined;
  terminatingContext = context?.terminate() ?? Promise.resolve();
  await terminatingContext;
  terminatingContext = undefined;
};

const importServerModule = async (type: "app" | "lib", name: string): Promise<SignalServerModule> =>
  type === "app" ? await import(`@apps/${name}/server`) : await import(`@libs/${name}/server`);

const importLibModule = async (name: string): Promise<SignalServerModule> => await import(`@libs/${name}/server`);

//? An app's server.ts is an image entry, so its testing env is read from the file; a lib's server.ts still exports
//? it, since every app's env.server.type.ts spreads it.
const importTestingEnv = async (type: "app" | "lib", name: string, targetModule: SignalServerModule) =>
  type === "app"
    ? ((await import(`@apps/${name}/env/env.server.testing`)) as { env?: BackendEnv }).env
    : targetModule.env;

export const setupSignalTestTarget = async <Fetch = FetchProxy>(
  {
    type = process.env.AKAN_TEST_TARGET_TYPE as "app" | "lib" | undefined,
    name = process.env.AKAN_TEST_TARGET_NAME,
    libNames = process.env.AKAN_TEST_LIBS?.split(",").filter(Boolean),
  }: { type?: "app" | "lib"; name?: string; libNames?: string[] } = {},
  options: SignalTestOptions = {},
) => {
  if (currentContext) return currentContext as SignalTestContext<Fetch>;
  if (pendingContext) return pendingContext as Promise<SignalTestContext<Fetch>>;
  if (!type || !name) throw new Error("Signal test target is not configured.");

  pendingContext = (async () => {
    terminatingContext = undefined;
    const resolvedOptions = { ...configuredOptions, ...options };
    const env: BaseEnv = {
      repoName: process.env.AKAN_PUBLIC_REPO_NAME ?? "akanjs",
      serveDomain: process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? "akanjs.com",
      appName: name,
      environment: "testing",
      operationMode: "local",
    };
    TestServer.applyProcessEnv(env, resolvedOptions);

    const [dependencyModules, targetModule] = await Promise.all([
      Promise.all((libNames ?? []).filter((libName) => libName !== name).map(importLibModule)),
      importServerModule(type, name),
    ]);
    const testingEnv = await importTestingEnv(type, name, targetModule);
    const target: SignalTestTarget = {
      type,
      name,
      env: { ...env, ...testingEnv },
      fetch: targetModule.fetch,
      libs: [...dependencyModules.map((mod) => mod.lib), targetModule.lib],
    };
    const testServer = new TestServer(target.env, target.libs, {
      storage: "memory",
      ...resolvedOptions,
    });
    FetchClient.useTestClientIps();
    await testServer.init();
    currentContext = {
      fetch: target.fetch,
      target,
      server: testServer,
      terminate: () => testServer.terminate(),
    };
    return currentContext;
  })();

  return pendingContext as Promise<SignalTestContext<Fetch>>;
};
