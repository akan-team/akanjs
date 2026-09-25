import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DictionaryLookup } from "./DictionaryLookup";
import { DictionaryRegistry } from "./dictionaryRegistry";
import type { RootDictionary } from "./trans";

const root: RootDictionary = {
  en: {
    user: {
      signal: {
        createUser: {
          t: "Create User",
          desc: { t: "Creates a user" },
          arg: { data: { t: "Data", desc: { t: "The user payload" } } },
        },
        removeUser: { t: "Remove User", arg: {} },
      },
      nickname: { t: "" },
    },
    llmModel: {
      "gpt-5.6-terra": { t: "GPT 5.6 Terra", desc: { t: "The model is GPT 5.6 Terra" } },
    },
  },
  ko: {
    user: {
      signal: { createUser: { t: "유저 생성", desc: { t: "유저를 생성한다" }, arg: {} } },
    },
  },
};

describe("DictionaryLookup", () => {
  beforeEach(() => {
    DictionaryRegistry.clear();
    DictionaryRegistry.register(root, {});
  });
  afterEach(() => {
    DictionaryRegistry.clear();
  });

  test("resolves a dotted key to its translation", () => {
    const lookup = new DictionaryLookup("en");
    expect(lookup.text("user.signal.createUser")).toBe("Create User");
    expect(lookup.text("user.signal.createUser.desc")).toBe("Creates a user");
    expect(lookup.text("user.signal.createUser.arg.data.desc")).toBe("The user payload");
  });

  test("returns undefined instead of echoing the key back when a translation is missing", () => {
    const lookup = new DictionaryLookup("en");
    expect(lookup.text("user.signal.removeUser.desc")).toBeUndefined();
    expect(lookup.text("user.signal.unknownEndpoint")).toBeUndefined();
    expect(lookup.text("unknownModel.signal.x")).toBeUndefined();
    // An empty translation is as unusable as a missing one — callers must be able to omit the field.
    expect(lookup.text("user.nickname")).toBeUndefined();
  });

  test("resolves an enum key whose value carries the separator", () => {
    const lookup = new DictionaryLookup("en");
    expect(lookup.text("llmModel.gpt-5.6-terra")).toBe("GPT 5.6 Terra");
    expect(lookup.text("llmModel.gpt-5.6-terra.desc")).toBe("The model is GPT 5.6 Terra");
    expect(lookup.text("llmModel.gpt-5.6")).toBeUndefined();
  });

  test("rejects a key that names no path below a model", () => {
    expect(new DictionaryLookup("en").text("user")).toBeUndefined();
    expect(new DictionaryLookup("en").text("")).toBeUndefined();
  });

  test("selects the requested language and falls back to the first registered one", () => {
    expect(new DictionaryLookup("ko").text("user.signal.createUser")).toBe("유저 생성");
    expect(new DictionaryLookup("ja").language).toBe("en");
    expect(new DictionaryLookup().text("user.signal.createUser")).toBe("Create User");
  });
});
