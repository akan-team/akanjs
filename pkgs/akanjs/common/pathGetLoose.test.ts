import { describe, expect, test } from "bun:test";
import { pathGetLoose } from "./pathGetLoose";

const dict = {
  llmModel: {
    "gpt-5.6-terra": { t: "GPT 5.6 Terra", desc: { t: "The model is GPT 5.6 Terra" } },
    "claude-opus-5": { t: "Claude Opus 5" },
  },
  user: { signal: { createUser: { arg: { data: { t: "Data" } } } } },
  ambiguous: { "a.b": { t: "literal" }, a: { b: { t: "nested" } } },
};

describe("pathGetLoose", () => {
  test("resolves a segment that contains the separator", () => {
    expect((pathGetLoose("llmModel.gpt-5.6-terra", dict) as { t: string }).t).toBe("GPT 5.6 Terra");
  });

  test("keeps resolving past a dotted segment", () => {
    expect((pathGetLoose("llmModel.gpt-5.6-terra.desc", dict) as { t: string }).t).toBe("The model is GPT 5.6 Terra");
  });

  test("resolves a plain dotted path unchanged", () => {
    expect((pathGetLoose("user.signal.createUser.arg.data", dict) as { t: string }).t).toBe("Data");
  });

  test("takes a segment array", () => {
    expect((pathGetLoose(["gpt-5", "6-terra"], dict.llmModel) as { t: string }).t).toBe("GPT 5.6 Terra");
  });

  test("returns the fallback for a missing leaf and a missing branch", () => {
    expect(pathGetLoose("llmModel.gpt-6", dict, ".", { t: "fb" })).toEqual({ t: "fb" });
    expect(pathGetLoose("llmModel.gpt-5.6-terra.missing", dict, ".", { t: "fb" })).toEqual({ t: "fb" });
    expect(pathGetLoose("user.signal", null, ".", { t: "fb" })).toEqual({ t: "fb" });
  });

  test("prefers the nested path over a literal dotted key, so existing keys resolve as before", () => {
    expect((pathGetLoose("ambiguous.a.b", dict) as { t: string }).t).toBe("nested");
  });
});
