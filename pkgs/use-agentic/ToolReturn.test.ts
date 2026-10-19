import { describe, expect, test } from "bun:test";
import { ToolReturn } from "./ToolReturn";

describe("ToolReturn", () => {
  test("splits what attach built, and leaves any other value whole", () => {
    const photo = { name: "a.png", mimeType: "image/png", data: "AAAA" };
    expect(ToolReturn.split(ToolReturn.attach("seen", [photo]))).toEqual({ result: "seen", attachments: [photo] });
    expect(ToolReturn.split({ result: "x", attachments: [photo] })).toEqual({
      result: { result: "x", attachments: [photo] },
      attachments: [],
    });
    expect(ToolReturn.split(null)).toEqual({ result: null, attachments: [] });
  });

  test("recognizes one built by another bundled copy of the package, which shares only the interned brand", () => {
    const photo = { name: "a.png", mimeType: "image/png", data: "AAAA" };
    const foreign = Object.defineProperty(
      { result: "seen", attachments: [photo] },
      Symbol.for("use-agentic.ToolReturn"),
      {
        value: true,
      },
    );
    expect(ToolReturn.split(foreign)).toEqual({ result: "seen", attachments: [photo] });
  });
});
