import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { AkanLib } from "../akanLib";
import { AkanOption } from "../akanOption";
import type { DiLifecycle } from "../di/diLifecycle";
import { AgentTools } from "../mcp/AgentTools";
import {
  makeSqliteEnv,
  ServerResolverTestEndpoint,
  ServerResolverTestInternal,
  ServerResolverTestServerSignal,
  ServerResolverTestSlice,
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel,
} from "../resolver/resolver.contract.fixture";

export class DevtoolsFixture {
  static async boot(serverMode: "federation" | "batch" | "all" = "all"): Promise<DevtoolsFixture> {
    process.env.AKAN_PUBLIC_APP_NAME = "devtools";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = serverMode;
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("../di/diLifecycle");

    const workspaceRoot = await mkdtemp(join(tmpdir(), "akan-devtools-"));
    const env = makeSqliteEnv(workspaceRoot);

    const lib = new AkanLib("devtoolsTest", {
      databases: [
        {
          constant: serverResolverTestConstant,
          database: serverResolverTestDatabase,
          service: serverResolverTestServiceModel,
          signal: {
            endpoint: ServerResolverTestEndpoint,
            slice: ServerResolverTestSlice,
            internal: ServerResolverTestInternal,
            server: ServerResolverTestServerSignal,
          },
        },
      ] as never,
      services: [],
      scalars: [],
      option: new AkanOption(),
    });
    const lifecycle = new DiLifecycle({ env }, lib);
    AgentTools.provide(lifecycle, { env, mcpOption: {}, mcpReadOnly: false });
    await lifecycle.initializeAll();
    return new DevtoolsFixture(lifecycle, env, serverMode, workspaceRoot);
  }

  readonly lifecycle: DiLifecycle;
  readonly env: BackendEnv;
  readonly serverMode: "federation" | "batch" | "all";
  readonly #workspaceRoot: string;

  constructor(
    lifecycle: DiLifecycle,
    env: BackendEnv,
    serverMode: "federation" | "batch" | "all",
    workspaceRoot: string,
  ) {
    this.lifecycle = lifecycle;
    this.env = env;
    this.serverMode = serverMode;
    this.#workspaceRoot = workspaceRoot;
  }

  async destroy() {
    await this.lifecycle.destroyAll();
    await rm(this.#workspaceRoot, { recursive: true, force: true });
  }
}

export const fixtureRefName = "serverResolverTestItem";
