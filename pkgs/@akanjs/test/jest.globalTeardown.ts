/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import "tsconfig-paths/register";

import { TestServer } from "./jest.testServer";

const teardown = async (globalConfig, projectConfig) => {
  const testServers: TestServer[] | undefined = global.__TEST_SERVERS__;
  if (!testServers) throw new Error("Test servers are not defined");
  await Promise.all(testServers.map((server) => server.terminate()));
};

export default teardown;
