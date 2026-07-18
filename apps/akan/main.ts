import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();
