import { describe, expect, test } from "bun:test";
import { cookieHeaderHasAuthToken, isAuthTokenKey } from "./authCookie";

describe("isAuthTokenKey", () => {
  test("recognises both spellings so a signout can sweep the whole jar", () => {
    expect(isAuthTokenKey("jwt")).toBe(true);
    expect(isAuthTokenKey("jwt:alpha")).toBe(true);
    expect(isAuthTokenKey("jwt:beta")).toBe(true);
    expect(isAuthTokenKey("jwtish")).toBe(false);
    expect(isAuthTokenKey("theme")).toBe(false);
  });
});

describe("cookieHeaderHasAuthToken", () => {
  test("matches a scoped and a legacy entry anywhere in the header", () => {
    expect(cookieHeaderHasAuthToken("jwt:alpha=abc")).toBe(true);
    expect(cookieHeaderHasAuthToken("theme=dark; jwt:alpha=abc")).toBe(true);
    expect(cookieHeaderHasAuthToken("theme=dark; jwt=abc")).toBe(true);
  });

  test("does not match a value that merely mentions the key", () => {
    expect(cookieHeaderHasAuthToken("theme=jwt=dark")).toBe(false);
    expect(cookieHeaderHasAuthToken("myjwt=abc")).toBe(false);
    expect(cookieHeaderHasAuthToken("")).toBe(false);
    expect(cookieHeaderHasAuthToken(null)).toBe(false);
  });
});
