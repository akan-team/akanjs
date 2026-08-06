import { beforeEach, describe, expect, test } from "bun:test";
import { modelDictionary, scalarDictionary, serviceDictionary } from "./dictInfo";
import { DictionaryRegistry } from "./dictionaryRegistry";
import { makeTrans } from "./trans";

const languages = ["en", "ko"] as [string, string];

const serviceModule = () => ({
  dict: serviceDictionary(languages)
    .endpoint((fn) => ({ ping: fn(["Ping", "핑"]).desc(["Ping desc", "핑 설명"]) }))
    .translate({ ready: ["Ready", "준비됨"] }),
});

const modelModule = () => ({
  dict: modelDictionary(languages)
    .of((t) => t(["Registry Item", "레지스트리 항목"]))
    .translate({ summary: ["Summary", "요약"] }),
});

const scalarModule = () => ({
  dict: scalarDictionary(languages).of((t) => t(["Registry Scalar", "레지스트리 스칼라"])),
});

beforeEach(() => {
  DictionaryRegistry.clear();
});

describe("DictionaryRegistry", () => {
  test("collects the root every makeTrans call builds", () => {
    makeTrans({ registryService: serviceModule() as never });
    const root = DictionaryRegistry.getRoot();
    expect(DictionaryRegistry.getLanguages().sort()).toEqual(["en", "ko"]);
    expect(root.en.registryService.ready).toEqual({ t: "Ready" });
    expect(root.ko.registryService.ready).toEqual({ t: "준비됨" });
  });

  test("labels each module with the dictionary kind it was declared as", () => {
    makeTrans({
      registryService: serviceModule() as never,
      registryItem: modelModule() as never,
      registryScalar: scalarModule() as never,
    });
    const modules = DictionaryRegistry.getModules();
    expect(modules.registryService.kind).toBe("service");
    expect(modules.registryItem.kind).toBe("model");
    expect(modules.registryScalar.kind).toBe("scalar");
    expect(modules.registryService.languages).toEqual(["en", "ko"]);
  });

  test("merges roots in registration order so a later lib wins on conflict", () => {
    makeTrans({
      registryService: {
        dict: serviceDictionary(languages).translate({ ready: ["Old", "이전"] }),
      } as never,
    });
    makeTrans({
      registryService: {
        dict: serviceDictionary(languages).translate({ ready: ["New", "새로움"] }),
      } as never,
    });
    expect(DictionaryRegistry.getRoot().en.registryService.ready).toEqual({ t: "New" });
  });

  test("flattens leaf translations into dotted paths", () => {
    makeTrans({ registryService: serviceModule() as never });
    const keys = DictionaryRegistry.getKeys();
    expect(keys).toContain("registryService.ready");
    expect(keys).toContain("registryService.signal.ping");
    expect(keys).toContain("registryService.signal.ping.desc");
  });

  test("round-trips through JSON", () => {
    makeTrans({ registryService: serviceModule() as never, registryItem: modelModule() as never });
    const payload = {
      languages: DictionaryRegistry.getLanguages(),
      modules: DictionaryRegistry.getModules(),
      dictionary: DictionaryRegistry.getRoot(),
      keys: DictionaryRegistry.getKeys(),
    };
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
