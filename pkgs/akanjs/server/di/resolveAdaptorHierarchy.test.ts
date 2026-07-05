import { describe, expect, test } from "bun:test";
import { type AdaptorCls, adapt, CacheAdaptorRole } from "akanjs/service";
import { resolveAdaptorHierarchy } from "./resolveAdaptorHierarchy";

describe("resolveAdaptorHierarchy", () => {
  test("initializes cache provider before adaptors with memory injections", () => {
    const CacheProvider = adapt("hierarchyTestCache");
    const MemoryAdaptor = adapt("hierarchyTestMemory", ({ memory }) => ({
      token: memory(String),
    }));

    const { graph, stages } = resolveAdaptorHierarchy(
      new Map<string, AdaptorCls>([
        [MemoryAdaptor.refName, MemoryAdaptor],
        [CacheProvider.refName, CacheProvider],
      ]),
      new Map([[CacheAdaptorRole, CacheProvider]]),
    );

    const stageIndexOf = (refName: string) => stages.findIndex((stage) => stage.includes(refName));

    expect(graph.get(MemoryAdaptor.refName)?.dependencies).toEqual([CacheProvider.refName]);
    expect(stageIndexOf(CacheProvider.refName)).toBeLessThan(stageIndexOf(MemoryAdaptor.refName));
  });
});
