import { describe, expect, test } from "bun:test";
import { type AdaptorCls, AgentToolsRole, adapt, CacheAdaptorRole } from "akanjs/service";
import { resolveAdaptorHierarchy } from "./resolveHierarchy";

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

  test("adds no stage dependency for AgentToolsRole, which the server provides before the stages", () => {
    const Plugging = adapt("hierarchyTestAgentTools", ({ plug }) => ({ agentTools: plug(AgentToolsRole) }));

    const { graph } = resolveAdaptorHierarchy(new Map<string, AdaptorCls>([[Plugging.refName, Plugging]]));

    expect(graph.get(Plugging.refName)?.dependencies).toEqual([]);
  });
});
