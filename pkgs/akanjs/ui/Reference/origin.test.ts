import { describe, expect, test } from "bun:test";
import { originText, ownerOf, ownerOrderOf } from "./origin";

describe("origin helpers", () => {
  test("puts the app ahead of the libs it builds on", () => {
    const origins = [["akanjs"], ["util"], ["shared"], ["shared", "sceny"], ["genai"], ["sceny"], undefined];
    expect(ownerOrderOf(origins)).toEqual(["sceny", "genai", "shared", "util", "akanjs"]);
  });

  test("ranks an owner that only extends others ahead of what it extends", () => {
    expect(ownerOrderOf([["shared"], ["shared", "sceny"]])).toEqual(["sceny", "shared"]);
  });

  test("names the owner and what it extends", () => {
    expect(ownerOf(["shared", "sceny"])).toBe("sceny");
    expect(originText(["shared", "sceny"]).en).toBe("sceny (extends shared)");
    expect(originText(["sceny"]).en).toBe("sceny");
  });
});
