/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import "tsconfig-paths/register";

import type { BackendEnv } from "@akanjs/base";
import type { Config } from "@jest/types";

import { TestServer } from "./jest.testServer";

const setup = async (globalConfig: Config.InitialOptions, projectConfig) => {
  const { env } = require(`${globalConfig.rootDir}/env/env.server.testing`);
  const { fetch, registerModules, registerMiddlewares } = require(`${globalConfig.rootDir}/server`);
  const maxWorkers = globalConfig.maxWorkers;
  if (!maxWorkers) throw new Error("maxWorkers is not defined");
  const testServers = new Array(maxWorkers)
    .fill(0)
    .map(
      (_, idx) =>
        new TestServer(
          registerModules as (options: any) => any[],
          registerMiddlewares as (options: any) => any[],
          env as BackendEnv,
          idx + 1
        )
    );
  await Promise.all(testServers.map((server) => server.init()));
  global.__TEST_SERVERS__ = testServers;
  global.fetch = fetch;
  global.env = env;
  global.registerModules = registerModules;
};

export default setup;
