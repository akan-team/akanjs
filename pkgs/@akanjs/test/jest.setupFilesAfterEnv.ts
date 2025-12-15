/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { BackendEnv } from "@akanjs/base";

import { TestServer } from "./jest.testServer";

const { env, fetch } = global as any;
jest.setTimeout(30000);
global.beforeAll(async () => {
  TestServer.initClient(env as BackendEnv);
  await fetch.cleanup();
});

global.afterAll(async () => {
  await fetch.client.terminate();
});
