import { describe, expect, test } from "bun:test";
import { AkanPreview } from "./akanPreview";

const owner = "apps/demo/akan.config.ts";

describe("AkanPreview.parse", () => {
  test("keeps the sign-in function and the example paths, and reads a missing section as empty", () => {
    const signIn = async () => ({ jwt: "token" });
    expect(AkanPreview.parse(undefined, owner)).toEqual({});
    expect(AkanPreview.parse({}, owner)).toEqual({});
    expect(AkanPreview.parse({ signIn, examples: ["/chat/1?tab=files"] }, owner)).toEqual({
      signIn,
      examples: ["/chat/1?tab=files"],
    });
  });

  test("refuses a section it cannot read, naming the file and the key", () => {
    expect(() => AkanPreview.parse([], owner)).toThrow(`${owner} declares \`preview\`, which has to be an object`);
    expect(() => AkanPreview.parse({ login: () => null }, owner)).toThrow(
      "preview.login; it takes signIn and examples",
    );
    expect(() => AkanPreview.parse({ signIn: "/api/signin" }, owner)).toThrow(
      "preview.signIn, which has to be a function",
    );
    for (const examples of ["/chat/1", ["chat/1"], ["//host/chat/1"], [1]])
      expect(() => AkanPreview.parse({ examples }, owner)).toThrow("preview.examples, which has to list paths");
  });
});
