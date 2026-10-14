import { describe, expect, test } from "bun:test";
import { bearerTokenOf } from "./bearerTokenOf";

describe("bearerTokenOf", () => {
  test("reads the token whatever the scheme's case or the number of spaces before it", () => {
    for (const header of ["Bearer a.b-_~+/=", "bearer a.b-_~+/=", "BEARER a.b-_~+/=", "Bearer   a.b-_~+/="])
      expect(bearerTokenOf(header)).toBe("a.b-_~+/=");
  });

  test("reads nothing from a header that carries more than one word after the scheme", () => {
    for (const header of ["Bearer abc def", "Bearer abc\tdef", "Bearer abc ", "Bearer abc\n", "Bearer abc\u00a0def"])
      expect(bearerTokenOf(header)).toBeNull();
  });

  test("takes only spaces as the separator, and only at the start of the header", () => {
    for (const header of ["Bearer\tabc", "Bearer\u00a0abc", "Bearerabc", " Bearer abc", "x Bearer abc"])
      expect(bearerTokenOf(header)).toBeNull();
  });

  test("reads nothing without the scheme or the token", () => {
    for (const header of [null, undefined, "", "abc", "Bearer", "Bearer ", "Basic abc", "Token abc", "Bearer: abc"])
      expect(bearerTokenOf(header)).toBeNull();
  });
});
