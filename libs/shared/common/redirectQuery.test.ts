import { describe, expect, it } from "bun:test";

import { withRedirectQuery } from "./redirectQuery";

describe("withRedirectQuery", () => {
  it("adds a query to a bare path", () => {
    expect(withRedirectQuery("/signup/2_agreePolicies", { userId: "u1" })).toBe("/signup/2_agreePolicies?userId=u1");
  });

  it("keeps a query the caller was already carrying", () => {
    const redirect = "/signup/2_agreePolicies?next=%2Fbootstrap%2Foneshot%3Fprompt%3Dhi";
    const href = withRedirectQuery(redirect, { userId: "u1" });
    const params = new URL(href, "https://cloud.akanjs.com").searchParams;
    expect(params.get("userId")).toBe("u1");
    expect(params.get("next")).toBe("/bootstrap/oneshot?prompt=hi");
  });

  it("overwrites a param the caller already set", () => {
    expect(withRedirectQuery("/signup/3_activate?userId=stale", { userId: "u1" })).toBe("/signup/3_activate?userId=u1");
  });

  it("returns the path unchanged when there is nothing to add", () => {
    expect(withRedirectQuery("/home", {})).toBe("/home");
  });
});
