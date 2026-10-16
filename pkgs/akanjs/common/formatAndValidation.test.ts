import { describe, expect, test } from "bun:test";

import {
  capitalize,
  formatNumber,
  formatPhone,
  isEmail,
  isPhoneNumber,
  isValidDate,
  lowerlize,
  mergeVersion,
  splitVersion,
} from ".";

describe("format and validation helpers", () => {
  test("capitalizes and lowerlizes only the first character", () => {
    expect(capitalize("akan")).toBe("Akan");
    expect(capitalize("aKan")).toBe("AKan");
    expect(lowerlize("Akan")).toBe("akan");
    expect(lowerlize("AKan")).toBe("aKan");
  });

  test("formats numbers while preserving decimal text", () => {
    expect(formatNumber("1234567")).toBe("1,234,567");
    expect(formatNumber("1,234,567.89")).toBe("1,234,567.89");
    expect(formatNumber("12abc34")).toBe("1,234");
  });

  test("formats supported phone number lengths", () => {
    expect(formatPhone("0101234567")).toBe("010-123-4567");
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
    expect(formatPhone("0212345678")).toBe("021-234-5678");
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone("")).toBe("");
  });

  test("validates email and phone strings", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("user.name@example.co.kr")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail(null)).toBe(false);
    expect(isEmail("first-last@mail.example-host.io")).toBe(true);
    expect(isEmail("a@b.abcdefgh")).toBe(true);
    expect(isEmail("a@b.abcdefghi")).toBe(false);
    expect(isEmail("a@b.c")).toBe(false);
    expect(isEmail("a@b-co")).toBe(false);
    expect(isEmail("a..b@example.com")).toBe(false);
    expect(isEmail(".a@example.com")).toBe(false);
    expect(isEmail("a@example..com")).toBe(false);
    expect(isEmail(`${"0".repeat(5000)}!`)).toBe(false);
    expect(isEmail(`0@${"0".repeat(5000)}!`)).toBe(false);

    expect(isPhoneNumber("010-1234-5678")).toBe(true);
    expect(isPhoneNumber("031-123-4567")).toBe(true);
    expect(isPhoneNumber("01012345678")).toBe(false);
    expect(isPhoneNumber(undefined)).toBe(false);
  });

  test("validates dates from strings and Date instances", () => {
    expect(isValidDate("2025-01-01")).toBe(true);
    expect(isValidDate("not-a-date")).toBe(false);
    expect(isValidDate(new Date("2025-01-01T00:00:00.000Z"))).toBe(true);
    expect(isValidDate(new Date("not-a-date"))).toBe(false);
  });

  test("splits and merges semantic version parts", () => {
    expect(splitVersion("1.2.3")).toEqual({ major: "1", minor: "2", patch: "3" });
    expect(mergeVersion(1, 2, 3)).toBe("1.2.3");
    expect(() => splitVersion("1.2")).toThrow("Invalid version");
  });
});
