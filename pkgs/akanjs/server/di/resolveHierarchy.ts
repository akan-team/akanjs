import { INJECT_META } from "akanjs/base";
import { type AdaptorCls, AgentToolsRole, CacheAdaptorRole, type InjectInfo, type ServiceCls } from "akanjs/service";

export interface DependencyNode {
  key: string;
  dependencies: string[];
}

export function topologicalStages<T extends DependencyNode>(graph: Map<string, T>): string[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const [key, node] of graph) {
    inDegree.set(key, node.dependencies.length);
    dependents.set(key, []);
  }

  for (const [, node] of graph) {
    for (const dep of node.dependencies) {
      dependents.get(dep)?.push(node.key);
    }
  }

  let queue: string[] = [];
  for (const [key, degree] of inDegree) {
    if (degree === 0) queue.push(key);
  }

  const stages: string[][] = [];
  let processed = 0;

  while (queue.length > 0) {
    stages.push(queue);
    processed += queue.length;

    const next: string[] = [];
    for (const key of queue) {
      for (const dependent of dependents.get(key) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) next.push(dependent);
      }
    }
    queue = next;
  }

  if (processed !== graph.size) {
    const remaining = [...graph.keys()].filter((k) => (inDegree.get(k) ?? 0) > 0);
    const cycle = traceCycle(graph, remaining);
    throw new Error(`Circular dependency detected: ${cycle.join(" → ")}`);
  }

  return stages;
}

export function traceCycle<T extends DependencyNode>(graph: Map<string, T>, candidates: string[]): string[] {
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(key: string): string[] | null {
    if (path.includes(key)) {
      const cycleStart = path.indexOf(key);
      return [...path.slice(cycleStart), key];
    }
    if (visited.has(key)) return null;
    visited.add(key);
    path.push(key);

    const node = graph.get(key);
    if (node) {
      for (const dep of node.dependencies) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }
    }

    path.pop();
    return null;
  }

  for (const key of candidates) {
    const cycle = dfs(key);
    if (cycle) return cycle;
  }

  return candidates;
}

interface ServiceNode extends DependencyNode {
  service: ServiceCls;
}

export interface ServiceHierarchy {
  graph: Map<string, ServiceNode>;
  stages: string[][];
}

export function resolveServiceHierarchy(serviceMap: Map<string, ServiceCls>): ServiceHierarchy {
  const graph = new Map<string, ServiceNode>();

  for (const [key, service] of serviceMap) {
    const injectMap: Record<string, InjectInfo> = service[INJECT_META] ?? {};
    const dependencies: string[] = [];

    for (const [propKey, { type }] of Object.entries(injectMap)) {
      if (type !== "service" && type !== "database") continue;
      const depKey = propKey.replace(type === "service" ? /Service$/ : /Model$/, "");
      if (serviceMap.has(depKey) && depKey !== key) dependencies.push(depKey);
    }

    graph.set(key, { key, service, dependencies });
  }
  const stages = topologicalStages(graph);

  return { graph, stages };
}

interface AdaptorNode extends DependencyNode {
  adaptor: AdaptorCls;
}

export interface AdaptorHierarchy {
  graph: Map<string, AdaptorNode>;
  stages: string[][];
}

export function collectAdaptors(sources: { [INJECT_META]: Record<string, InjectInfo> }[]): Set<AdaptorCls> {
  const discovered = new Set<AdaptorCls>();

  function scan(injectMap: Record<string, InjectInfo>) {
    for (const injectInfo of Object.values(injectMap)) {
      //? The server provides this role before the stages run; a stage would build the role's empty class over it.
      if (injectInfo.adaptor === AgentToolsRole) continue;
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
        if (!injectInfo.adaptor || injectInfo.adaptor === AgentToolsRole) continue;
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

  return { graph, stages };
}
