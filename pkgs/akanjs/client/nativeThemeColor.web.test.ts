import { expect, mock, test } from "bun:test";
import { NativeThemeColor } from "./nativeThemeColor";

let pluginLoads = 0;
mock.module("@akanjs/native/plugins/appearance", () => {
  pluginLoads += 1;
  return { appearance: { isSupported: () => false, isAllowed: () => false } };
});

test("a browser never loads the appearance plugin", async () => {
  NativeThemeColor.follow("#654321");
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(pluginLoads).toBe(0);
});
