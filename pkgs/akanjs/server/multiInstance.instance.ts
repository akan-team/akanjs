import type { BackendEnv } from "akanjs/base";
import { AkanServer } from "./akanServer";
import { createCrossLib } from "./multiInstance.fixture";

// One instance of the fixture app: `PORT` and `AKAN_DATABASE_MODE` come from the test that spawned it, the storage
// from `AKAN_TEST_INSTANCE_ENV`. It says `ready` once it listens.
const env = JSON.parse(process.env.AKAN_TEST_INSTANCE_ENV ?? "{}") as BackendEnv;
const server = new AkanServer("crossTest", env, "all", createCrossLib());
await server.start({ listen: true, web: false });
process.stdout.write("ready\n");
