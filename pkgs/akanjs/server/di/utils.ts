import { INJECT_META } from "akanjs/base";
import { lowerlize } from "akanjs/common";
import type { InjectInfo } from "akanjs/service";
import type { DatabaseModule, ServiceModule } from "../akanLib";

interface StageTask {
  label: string;
  run: () => Promise<unknown>;
}

interface DestroyableUse {
  onDestroy(): Promise<void> | void;
}

type InjectableCls = { [INJECT_META]?: unknown };

export interface DiModuleCandidate {
  refName: string;
  module: DatabaseModule | ServiceModule;
}

export const isDestroyableUse = (value: unknown): value is DestroyableUse =>
  typeof value === "object" &&
  value !== null &&
  "onDestroy" in value &&
  typeof (value as { onDestroy?: unknown }).onDestroy === "function";

export const normalizeServiceRefName = (refName: string) => {
  const normalized = lowerlize(refName);
  return normalized.endsWith("Service") ? normalized.slice(0, -"Service".length) : normalized;
};

export const normalizeSignalRefName = (refName: string) => {
  const normalized = lowerlize(refName);
  return normalized.endsWith("Signal") ? normalized : `${normalized}Signal`;
};

export const normalizeAdaptorRefName = (refName: string) => lowerlize(refName);

const normalizeInjectedServiceRefName = (propKey: string) =>
  propKey.endsWith("Service") ? propKey.slice(0, -"Service".length) : propKey;

const normalizeInjectedDatabaseRefName = (propKey: string) =>
  propKey.endsWith("Model") ? propKey.slice(0, -"Model".length) : propKey;

const normalizeInjectedSignalRefName = (propKey: string) => {
  const normalized = lowerlize(propKey);
  return normalized.endsWith("Signal") ? normalized.slice(0, -"Signal".length) : normalized;
};

const getModuleInjectables = (mod: DatabaseModule | ServiceModule): InjectableCls[] => {
  const injectables: InjectableCls[] = [mod.service.srv, mod.signal.internal, mod.signal.endpoint, mod.signal.server];
  if ("constant" in mod) injectables.push(mod.signal.slice);
  return injectables;
};

export const getModuleDependencyRefNames = (mod: DatabaseModule | ServiceModule) => {
  const dependencies = new Set<string>();
  for (const injectable of getModuleInjectables(mod)) {
    const injectMap = (injectable[INJECT_META] ?? {}) as Record<string, InjectInfo>;
    for (const [propKey, injectInfo] of Object.entries(injectMap)) {
      if (injectInfo.type === "service") dependencies.add(normalizeInjectedServiceRefName(propKey));
      else if (injectInfo.type === "database") dependencies.add(normalizeInjectedDatabaseRefName(propKey));
      else if (injectInfo.type === "signal") dependencies.add(normalizeInjectedSignalRefName(propKey));
    }
  }
  return dependencies;
};

/**
 * Run every task in parallel and, if any rejects, throw a single
 * `AggregateError` that enumerates every failing label + cause. This replaces
 * the previous `Promise.all` flow where a second concurrent failure in the
 * same stage would hide the first, making boot errors hard to localize.
 */
export const runStage = async (stageLabel: string, tasks: StageTask[]): Promise<void> => {
  if (tasks.length === 0) return;
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const failures: { label: string; reason: unknown }[] = [];
  settled.forEach((res, i) => {
    if (res.status === "rejected") {
      const task = tasks[i];
      failures.push({ label: task ? task.label : `#${i}`, reason: res.reason });
    }
  });
  if (failures.length === 0) return;
  const summary = failures.map((f) => `  • ${f.label}: ${reasonMessage(f.reason)}`).join("\n");
  const errors = failures.map((f) => toError(f.reason));
  throw new AggregateError(errors, `[DI:${stageLabel}] ${failures.length}/${tasks.length} task(s) failed:\n${summary}`);
};

export const toError = (reason: unknown): Error => {
  return reason instanceof Error ? reason : new Error(String(reason));
};

export const reasonMessage = (reason: unknown): string => {
  if (reason instanceof Error) {
    if (reason instanceof AggregateError && reason.errors?.length) {
      return `${reason.message} [${reason.errors.length} nested]`;
    }
    return reason.message;
  }
  return String(reason);
};
