import { describe, expect, test } from "bun:test";
import { ReportText } from "./reportText";

describe("ReportText.scrub", () => {
  test("drops the query string and fragment of a URL and of a relative path, keeping a frame's line and column", () => {
    expect(ReportText.scrub("at pay (http://shop.test/en/orders/7?token=s3cret#pay:12:4)")).toBe(
      "at pay (http://shop.test/en/orders/7:12:4)",
    );
    expect(ReportText.scrub("could not load /en/orders/7?token=s3cret&step=2")).toBe("could not load /en/orders/7");
    expect(ReportText.scrub("could not load orders?token=s3cret and /en/reset#code=7")).toBe(
      "could not load orders and /en/reset",
    );
    expect(ReportText.scrub("Unexpected token '?' in price #7")).toBe("Unexpected token '?' in price #7");
  });

  test("replaces an email address, a bearer credential and a JWT, and keeps a version and a stack frame", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY2NvdW50LTcifQ.c2lnbmF0dXJl";
    expect(ReportText.scrub("no cart for ada.lovelace+shop@example.co.kr")).toBe("no cart for [email]");
    expect(ReportText.scrub("401 with Authorization: Bearer abc.def-123/xyz=")).toBe(
      "401 with Authorization: Bearer [redacted]",
    );
    expect(ReportText.scrub(`session ${jwt} expired`)).toBe("session [redacted] expired");
    expect(ReportText.scrub(`session ${jwt.slice(0, 50)}`)).toBe("session [redacted]");
    expect(ReportText.scrub("react@19.3.1 threw\nOrderTotal@https://shop.test/_akan/client/orders-a1.js:3:15")).toBe(
      "react@19.3.1 threw\nOrderTotal@https://shop.test/_akan/client/orders-a1.js:3:15",
    );
  });

  test("removes the characters that reorder how a line displays", () => {
    expect(ReportText.scrub("paid ‮000,1$‬ to ⁦ada⁩‏")).toBe("paid 000,1$ to ada");
  });

  test("reads a long run with no query string once", () => {
    const started = performance.now();
    expect(ReportText.scrub("/".repeat(200_000))).toHaveLength(200_000);
    expect(ReportText.scrub("a".repeat(200_000))).toHaveLength(200_000);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
