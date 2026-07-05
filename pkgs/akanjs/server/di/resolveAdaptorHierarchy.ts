import { INJECT_META } from "akanjs/base";
import { type AdaptorCls, CacheAdaptorRole, type InjectInfo } from "akanjs/service";
import { type DependencyNode, topologicalStages } from "./resolveHierarchy";

interface AdaptorNode extends DependencyNode {
  adaptor: AdaptorCls;
}

export interface AdaptorHierarchy {
  graph: Map<string, AdaptorNode>;
  classToKey: Map<AdaptorCls, string>;
  /** Each stage contains adaptor map keys that can be initialized concurrently. Stages run sequentially. */
  stages: string[][];
}

/**
 * Recursively collects all AdaptorCls referenced via `plug` injections,
 * starting from the given sources (services, adaptors, or anything with INJECT_META).
 */
export function collectAdaptors(sources: { [INJECT_META]: Record<string, InjectInfo> }[]): Set<AdaptorCls> {
  const discovered = new Set<AdaptorCls>();

  function scan(injectMap: Record<string, InjectInfo>) {
    for (const injectInfo of Object.values(injectMap)) {
      if (injectInfo.type === "plug" && injectInfo.adaptor && !discovered.has(injectInfo.adaptor)) {
        discovered.add(injectInfo.adaptor);
        scan(injectInfo.adaptor[INJECT_META] ?? {});
      }
    }
  }

  for (const source of sources) {
    scan(source[INJECT_META] ?? {});
  }

  return discovered;
}

export function resolveAdaptorHierarchy(
  adaptorMap: Map<string, AdaptorCls>,
  adaptorRole: Map<AdaptorCls, AdaptorCls> = new Map(),
): AdaptorHierarchy {
  const classToKey = new Map<AdaptorCls, string>();
  for (const [key, adaptor] of adaptorMap) {
    classToKey.set(adaptor, key);
  }
  for (const [role, provider] of adaptorRole) {
    const providerKey = classToKey.get(provider);
    if (providerKey) classToKey.set(role, providerKey);
  }

  const graph = new Map<string, AdaptorNode>();

  for (const [key, adaptor] of adaptorMap) {
    const injectMap: Record<string, InjectInfo> = adaptor[INJECT_META] ?? {};
    const dependencies: string[] = [];
    const addDependency = (depKey: string) => {
      if (depKey !== key && !dependencies.includes(depKey)) dependencies.push(depKey);
    };

    for (const [propKey, injectInfo] of Object.entries(injectMap)) {
      if (injectInfo.type === "plug") {
        if (!injectInfo.adaptor) continue;
        const depKey = classToKey.get(injectInfo.adaptor);
        if (!depKey) {
          throw new Error(
            `Adaptor "${key}" has a plug dependency (property "${propKey}") ` +
              `on adaptor "${injectInfo.adaptor.refName}" which is not registered.`,
          );
        }
        addDependency(depKey);
      } else if (injectInfo.type === "use") {
        if (adaptorMap.has(propKey) && propKey !== key) {
          addDependency(propKey);
        }
      } else if (injectInfo.type === "memory") {
        const depKey = classToKey.get(CacheAdaptorRole);
        if (!depKey) {
          throw new Error(`Adaptor "${key}" has a memory dependency but cache adaptor role is not registered.`);
        }
        addDependency(depKey);
      }
    }

    graph.set(key, { key, adaptor, dependencies });
  }

  const stages = topologicalStages(graph);

  return { graph, classToKey, stages };
}
