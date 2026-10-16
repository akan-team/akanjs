import { describe, expect, test } from "bun:test";
import { interpolateTranslation } from "./interpolateTranslation";

describe("interpolateTranslation", () => {
  test("returns the message untouched when no data is given", () => {
    expect(interpolateTranslation("Hello {name}", undefined)).toBe("Hello {name}");
  });

  test("fills every placeholder the data names", () => {
    expect(
      interpolateTranslation("{greeting} {name}, you have {count}", { greeting: "Hi", name: "Ada", count: 3 }),
    ).toBe("Hi Ada, you have 3");
  });

  test("leaves a placeholder the data does not name as written", () => {
    expect(interpolateTranslation("Hello {name}", { other: "Ada" })).toBe("Hello {name}");
  });

  test("renders a doubled, empty or unterminated brace as typed", () => {
    expect(interpolateTranslation("Hello {{name}}", { name: "Ada" })).toBe("Hello {{name}}");
    expect(interpolateTranslation("{} and {name", { name: "Ada" })).toBe("{} and {name");
    expect(interpolateTranslation("{}{name}", { name: "Ada" })).toBe("{}Ada");
  });

  test("stays linear on a run of braces nothing closes", () => {
    const message = `}${"{".repeat(100_000)}`;
    expect(interpolateTranslation(message, { name: "Ada" })).toBe(message);
  });
});
