import { describe, expect, test } from "bun:test";
import { isPlaceholderAppId } from "./placeholderAppId";

describe("isPlaceholderAppId", () => {
  test("flags placeholder bundle identifiers that Apple's portal already claims", () => {
    for (const appId of ["com.myapp.app", "com.myorg.myapp", "com.example.foo", "com.changeme.app", ""]) {
      expect(isPlaceholderAppId(appId)).toBe(true);
    }
    for (const appId of ["com.minimal.app", "com.nearthlab.leadingflight", "io.akanjs.demo"]) {
      expect(isPlaceholderAppId(appId)).toBe(false);
    }
  });
});
