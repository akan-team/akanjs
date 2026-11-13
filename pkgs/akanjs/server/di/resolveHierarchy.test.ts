import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { type AdaptorCls, AgentToolsRole, adapt, CacheAdaptorRole, InjectError } from "akanjs/service";
import { resolveAdaptorHierarchy, topologicalStages } from "./resolveHierarchy";

const failureOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
};

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

  test("fails a plug or a memory inject whose adaptor nobody registered as notRegistered", () => {
    const Unregistered = adapt("hierarchyTestUnregistered");
    const Plugging = adapt("hierarchyTestPlugging", ({ plug }) => ({ missing: plug(Unregistered) }));
    const Remembering = adapt("hierarchyTestRemembering", ({ memory }) => ({ token: memory(String) }));
    const resolve = (adaptor: AdaptorCls) => () =>
      resolveAdaptorHierarchy(new Map<string, AdaptorCls>([[adaptor.refName, adaptor]]));

    const plugFailure = failureOf(resolve(Plugging));
    const memoryFailure = failureOf(resolve(Remembering));

    expect(InjectError.is(plugFailure, "notRegistered")).toBe(true);
    expect(plugFailure).toMatchObject({
      statusCode: 500,
      message:
        'Adaptor "hierarchyTestPlugging" has a plug dependency (property "missing") on adaptor "hierarchyTestUnregistered" which is not registered.',
    });
    expect(InjectError.is(memoryFailure, "notRegistered")).toBe(true);
    expect(memoryFailure).toMatchObject({
      statusCode: 500,
      message: 'Adaptor "hierarchyTestRemembering" has a memory dependency but cache adaptor role is not registered.',
    });
  });
});

describe("topologicalStages", () => {
  test("fails a dependency cycle as circularDependency, naming the cycle", () => {
    const graph = new Map([
      ["first", { key: "first", dependencies: ["second"] }],
      ["second", { key: "second", dependencies: ["first"] }],
    ]);

    const failure = failureOf(() => topologicalStages(graph));

    expect(AkanError.is(failure, "circularDependency")).toBe(true);
    expect(failure).toMatchObject({ statusCode: 500, message: "Circular dependency detected: first → second → first" });
  });
});
