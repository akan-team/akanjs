import { describe, expect, test } from "bun:test";
import { parseSearchParams } from "./parseSearchParams";

describe("parseSearchParams", () => {
  test("holds a key given once as a string and a repeated one as every value, in order", () => {
    expect(parseSearchParams("?tag=a&tag=b&sort=latest&tag=c")).toEqual({ tag: ["a", "b", "c"], sort: "latest" });
    expect(parseSearchParams("tag=&tag=b")).toEqual({ tag: ["", "b"] });
    expect(parseSearchParams("q=a+b%26c")).toEqual({ q: "a b&c" });
    expect(parseSearchParams("")).toEqual({});
  });

  test("keeps a __proto__ key as a value of its own, leaving the record's prototype alone", () => {
    const params = parseSearchParams("__proto__=x&__proto__=y&page=2");

    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(Object.hasOwn(params, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(params, "__proto__")?.value).toEqual(["x", "y"]);
    expect(params.page).toBe("2");
  });
});
