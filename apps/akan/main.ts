// Not the `akanjs/server` barrel: it re-exports AkanServer, whose graph the gateway never runs. Through the
// barrel this process evaluates 35MB of SSR renderer and DB driver to spawn children and relay bytes.
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();
