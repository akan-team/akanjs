import { describe, expect, test } from "bun:test";
import { labelOf } from "./labelOf";

describe("labelOf", () => {
  test("reads the field the text:title search role names", () => {
    const model = { text: { title: new Set(["subject"]), children: { title: new Set<string>() } } };
    expect(labelOf(model, { subject: "Fix login", title: "wrong" })).toBe("Fix login");
  });

  test("skips nested title paths and falls back to conventional keys", () => {
    const model = { text: { title: new Set(["works[*].name"]) } };
    expect(labelOf(model, { title: "Fix login" })).toBe("Fix login");
    expect(labelOf(model, { name: "Kang" })).toBe("Kang");
  });

  test("prefers the label the model wrote over every derived path", () => {
    const model = { text: { title: new Set(["subject"]) } };
    class LightTicket {
      subject = "Fix login";
      label() {
        return `#12 ${this.subject}`;
      }
    }
    expect(labelOf(model, new LightTicket())).toBe("#12 Fix login");
    // A `label` field that holds a string is data, not a renderer.
    expect(labelOf(model, { subject: "Fix login", label: "wrong" })).toBe("Fix login");
  });

  test("falls back when a label method cannot read the fields a projection dropped", () => {
    class LightAdmin {
      accountId?: string;
      name = "Kang";
      label() {
        return (this.accountId as string).split("@")[0];
      }
    }
    expect(labelOf({}, new LightAdmin())).toBe("Kang");
  });

  test("returns nothing for a value with no readable label", () => {
    expect(labelOf({}, { count: 3 })).toBeUndefined();
    expect(labelOf(null, null)).toBeUndefined();
  });
});
