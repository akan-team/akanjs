import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp().start();
};
void run();
