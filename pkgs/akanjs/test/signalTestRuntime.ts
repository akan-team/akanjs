import type { BackendEnv } from "akanjs/base";
import type { FetchProxy } from "akanjs/fetch";
import type { AkanLib } from "akanjs/server";
import { TestServer, type TestServerOptions } from "./testServer";

export interface SignalTestTarget {
  type: "app" | "lib";
  name: string;
  env: BackendEnv;
  fetch: FetchProxy;
  libs: AkanLib[];
}

export interface SignalTestContext<Fetch = FetchProxy> {
  fetch: Fetch;
  target: SignalTestTarget;
  terminate: () => Promise<void>;
}

export type SignalTestOptions = Pick<TestServerOptions, "databaseMode" | "workerId" | "port" | "serverMode">;

type SignalServerModule = {
  env: BackendEnv;
  fetch: FetchProxy;
  lib: AkanLib;
};

let currentContext: SignalTestContext | undefined;
let pendingContext: Promise<SignalTestContext> | undefined;
let terminatingContext: Promise<void> | undefined;
let configuredOptions: SignalTestOptions = {};

export const hasSignalTestContext = () => currentContext !== undefined || pendingContext !== undefined;

export const getSignalTestContext = <Fetch = FetchProxy>() => {
  if (!currentContext) {
    throw new Error("Signal test context is not initialized. Run through `akan test` or call setupSignalTestTarget().");
  }
  return currentContext as SignalTestContext<Fetch>;
};

export const getSignalTestFetch = <Fetch = FetchProxy>() => getSignalTestContext<Fetch>().fetch;

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

const importServerModule = async (type: "app" | "lib", name: string): Promise<SignalServerModule> => {
  return type === "app" ? await import(`@apps/${name}/server`) : await import(`@libs/${name}/server`);
};

const importLibModule = async (name: string): Promise<SignalServerModule> => {
  return await import(`@libs/${name}/server`);
};

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
    const env: BackendEnv = {
      repoName: process.env.AKAN_PUBLIC_REPO_NAME ?? "akanjs",
      serveDomain: process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? "akanjs.com",
      appName: name,
      environment: "testing",
      operationMode: "local",
      tunnelUsername: process.env.SSH_TUNNEL_USERNAME ?? "username",
      tunnelPassword: process.env.SSH_TUNNEL_PASSWORD ?? process.env.AKAN_PUBLIC_REPO_NAME ?? "password",
    };
    TestServer.applyProcessEnv(env, resolvedOptions);

    const [dependencyModules, targetModule] = await Promise.all([
      Promise.all((libNames ?? []).filter((libName) => libName !== name).map(importLibModule)),
      importServerModule(type, name),
    ]);
    const target: SignalTestTarget = {
      type,
      name,
      env: targetModule.env,
      fetch: targetModule.fetch,
      libs: [...dependencyModules.map((mod) => mod.lib), targetModule.lib],
    };
    const testServer = new TestServer(target.env, target.libs, {
      databaseMode: "memory",
      ...resolvedOptions,
    });
    await testServer.init();
    currentContext = {
      fetch: target.fetch,
      target,
      terminate: () => testServer.terminate(),
    };
    return currentContext;
  })();

  return pendingContext as Promise<SignalTestContext<Fetch>>;
};
