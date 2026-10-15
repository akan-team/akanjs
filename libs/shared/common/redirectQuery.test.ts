import { describe, expect, it } from "bun:test";

import { withRedirectQuery } from "./redirectQuery";
import { safeRedirectPath } from "./safeRedirectPath";

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

  it("keeps a fragment after the query", () => {
    expect(withRedirectQuery("/page#sec", { userId: "u1" })).toBe("/page?userId=u1#sec");
    expect(withRedirectQuery("/page?a=1#sec", { userId: "u1" })).toBe("/page?a=1&userId=u1#sec");
  });
});

describe("safeRedirectPath", () => {
  it("keeps a path on this site", () => {
    expect(safeRedirectPath("/ko/signin?next=%2Fhome", "/")).toBe("/ko/signin?next=%2Fhome");
  });

  it("falls back for another host, a scheme, a control character or a missing value", () => {
    for (const path of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null])
      expect(safeRedirectPath(path, "/fallback")).toBe("/fallback");
    expect(safeRedirectPath("/a\u0000b", "/fallback")).toBe("/fallback");
  });
});
