import { describe, expect, test } from "bun:test";
import { validate } from "./validate";

describe("validate.phone", () => {
  test.each([
    "010-1234-5678",
    "011-123-4567",
    "02-123-4567",
    "02-1234-5678",
    "031-123-4567",
    "070-1234-5678",
    "0505-123-4567",
  ])("accepts the Korean number %s", (phone) => {
    expect(validate.phone(phone)).toBe(true);
  });

  test.each(["---", "a-b-c", "010-12-5678", "010-1234-567", "01012345678", "+82-10-1234-5678", " 010-1234-5678"])(
    "refuses %p",
    (phone) => {
      expect(validate.phone(phone)).toBe(false);
    },
  );
});

describe("validate.email", () => {
  test.each(["hello@naver.com", "first.last+tag@sub.example.co.kr"])("accepts %s", (email) => {
    expect(validate.email(email)).toBe(true);
  });

  test.each([null, undefined, "", "hello", "a.b@c", "a@b.", "a@@b.com", "a b@c.com", "@b.com"])(
    "refuses %p",
    (email) => {
      expect(validate.email(email)).toBe(false);
    },
  );
});
