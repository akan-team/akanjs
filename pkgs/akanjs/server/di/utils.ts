import { FIELD_META, INJECT_META } from "akanjs/base";
import { lowerlize, toError } from "akanjs/common";
import { ConstantRegistry, type FieldObject } from "akanjs/constant";
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

// A relation resolves through its target's service on every read, so a selection that left the target out fails there.
export const getModuleRelationRefNames = (mod: DatabaseModule | ServiceModule) => {
  const dependencies = new Set<string>();
  if (!("constant" in mod)) return dependencies;
  const visited = new Set<unknown>();
  const visit = (modelRef: unknown) => {
    if (visited.has(modelRef)) return;
    visited.add(modelRef);
    const fields = (modelRef as { [FIELD_META]?: FieldObject })[FIELD_META] ?? {};
    for (const field of Object.values(fields)) {
      if (!field.isClass) continue;
      if (field.isScalar) visit(field.modelRef);
      else {
        const refName = ConstantRegistry.getRefName(field.modelRef, { allowEmpty: true });
        if (refName) dependencies.add(refName);
      }
    }
  };
  visit(mod.constant.full);
  return dependencies;
};

// Cascade targets are boot deps the inject graph misses (seal fails without them); polymorphic owners are exempt.
export const getModuleCascadeRefNames = (mod: DatabaseModule | ServiceModule) => {
  const dependencies = new Set<string>();
  if (!("constant" in mod)) return dependencies;
  const { cascade } = mod.constant.full;
  for (const modelRef of cascade.removeRef.values()) dependencies.add(ConstantRegistry.getRefName(modelRef));
  for (const path of cascade.removeWith.values()) {
    if (path.anyOwner || path.typeValues.length) continue;
    dependencies.add(path.refName ?? ConstantRegistry.getRefName(path.modelRef as never));
  }
  return dependencies;
};

export interface Registration {
  key: string;
  /** What claimed the key, phrased for a boot error: `predefined adaptor "storage"`, `lib "shared"`. */
  owner: string;
}

// Downstream maps are last-write-wins, so a duplicate would silently skip the other's `onInit`.
export const assertUniqueRegistrations = (kind: string, registrations: Registration[]) => {
  const claimed = new Map<string, string>();
  const clashes: string[] = [];
  for (const { key, owner } of registrations) {
    const previous = claimed.get(key);
    if (previous) clashes.push(`  • "${key}" is registered by ${previous} and by ${owner}`);
    else claimed.set(key, owner);
  }
  if (!clashes.length) return;
  throw new Error(`[DI:${kind}] ${clashes.length} duplicate registration(s):\n${clashes.join("\n")}`);
};

// allSettled, not Promise.all: every failing task of a stage is reported, not just the first.
export const runStage = async (stageLabel: string, tasks: StageTask[]): Promise<void> => {
  if (tasks.length === 0) return;
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const failures = settled.flatMap((res, i) =>
    res.status === "rejected" ? [{ label: tasks[i]?.label ?? `#${i}`, reason: res.reason }] : [],
  );
  throwStageFailures(stageLabel, failures, tasks.length);
};

export const throwStageFailures = (
  stageLabel: string,
  failures: { label: string; reason: unknown }[],
  total: number,
) => {
  if (failures.length === 0) return;
  const summary = failures.map((f) => `  • ${f.label}: ${reasonMessage(f.reason)}`).join("\n");
  const errors = failures.map((f) => toError(f.reason));
  throw new AggregateError(errors, `[DI:${stageLabel}] ${failures.length}/${total} task(s) failed:\n${summary}`);
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
