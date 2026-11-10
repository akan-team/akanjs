import {
  databaseStateNames,
  endpointNames,
  formSetterNames,
  modelNames,
  moduleNames,
  queryNames,
  sliceNames,
  stateSetterName,
} from "akanjs/common/akanNames.ts";
import {
  type AkanSpan,
  type ConstantClassFact,
  type FileFacts,
  guardLabelOf,
  type NamedFact,
  type SliceClassFact,
} from "./moduleFacts";

export type AkanFamily = "slice" | "query" | "model" | "formSetter" | "storeState" | "endpoint" | "module";

//? `srv`/`sig`/`db` and `fetch.slice` reuse the bare model name, which is any local variable elsewhere.
export type AkanReceiverGate = "srv" | "sig" | "db" | "slice" | "state";

export interface AkanTarget {
  family: AkanFamily;
  refName: string;
  owner: string | null;
  sourceKey: string;
  label: string;
  detail: string[];
  span: AkanSpan;
}

export interface AkanEntry extends AkanTarget {
  name: string;
  role: string;
  gate: AkanReceiverGate | null;
  renamed?: (sourceKey: string) => string;
  dictionary?: { section: "slice" | "query"; className: string };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface ConstantScope {
  own: ConstantClassFact[];
  libs: ConstantClassFact[];
}

interface ModuleGroup {
  owner: string | null;
  refName: string;
  constants: ConstantClassFact[];
  slices: SliceClassFact[];
  facts: FileFacts[];
}

export class NameTable {
  readonly #byName = new Map<string, AkanEntry[]>();
  readonly #byFile = new Map<string, AkanEntry[]>();

  constructor(files: Iterable<FileFacts>) {
    const all = [...files];
    const constantsByOwner = new Map<string | null, ConstantClassFact[]>();
    for (const facts of all) {
      const constants = constantsByOwner.get(facts.owner) ?? [];
      constants.push(...facts.constants);
      constantsByOwner.set(facts.owner, constants);
    }
    const libConstants = [...constantsByOwner].filter(([owner]) => owner?.startsWith("libs/"));
    const scope = (owner: string | null): ConstantScope => ({
      own: constantsByOwner.get(owner) ?? [],
      libs: libConstants.filter(([key]) => key !== owner).flatMap(([, constants]) => constants),
    });
    const scopes = new Map<string | null, ConstantScope>();
    for (const group of NameTable.#groupsOf(all)) {
      const constants = scopes.get(group.owner) ?? scope(group.owner);
      scopes.set(group.owner, constants);
      this.#addGroup(group, constants);
    }
  }

  lookup(name: string) {
    return this.#byName.get(name) ?? [];
  }

  entriesTargeting(fileName: string) {
    return this.#byFile.get(fileName) ?? [];
  }

  static #groupsOf(files: FileFacts[]) {
    const groups = new Map<string, ModuleGroup>();
    const groupOf = (owner: string | null, refName: string) => {
      const key = `${owner ?? ""}:${refName}`;
      const group = groups.get(key) ?? { owner, refName, constants: [], slices: [], facts: [] };
      groups.set(key, group);
      return group;
    };
    for (const facts of files) {
      const refs = new Set<string>();
      for (const item of [...facts.services, ...facts.slices, ...facts.endpoints, ...facts.stores, ...facts.models])
        if (item.model) refs.add(item.model);
      for (const filter of facts.filters)
        if (filter.name.endsWith("Filter")) refs.add(NameTable.#lowerFirst(filter.name.slice(0, -6)));
      for (const constant of facts.constants) refs.add(NameTable.#lowerFirst(constant.name));
      for (const refName of refs) groupOf(facts.owner, refName).facts.push(facts);
    }
    for (const group of groups.values()) {
      group.constants = group.facts.flatMap((facts) => facts.constants);
      group.slices = group.facts.flatMap((facts) => facts.slices.filter((slice) => slice.model === group.refName));
    }
    return [...groups.values()].filter((group) =>
      group.facts.some(
        (facts) =>
          facts.services.some((item) => item.model === group.refName) ||
          facts.slices.some((item) => item.model === group.refName) ||
          facts.stores.some((item) => item.model === group.refName) ||
          facts.models.some((item) => item.model === group.refName),
      ),
    );
  }

  static #lowerFirst(text: string) {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  #add(entry: AkanEntry) {
    if (entry.name === entry.sourceKey) return;
    const sameName = this.#byName.get(entry.name) ?? [];
    if (
      sameName.some(
        (other) =>
          other.gate === entry.gate &&
          other.span.fileName === entry.span.fileName &&
          other.span.start === entry.span.start,
      )
    )
      return;
    sameName.push(entry);
    this.#byName.set(entry.name, sameName);
    const sameFile = this.#byFile.get(entry.span.fileName) ?? [];
    sameFile.push(entry);
    this.#byFile.set(entry.span.fileName, sameFile);
  }

  #addGroup(group: ModuleGroup, constants: ConstantScope) {
    const { owner, refName } = group;
    const Model = capitalize(refName);
    const base = { owner, refName };
    const modelClass = group.constants.find((constant) => constant.name === Model);
    const facts = group.facts;
    const labels: Record<string, string> = Object.assign({}, ...facts.map((file) => file.guardLabels));
    const guarded = (guards: string[]) =>
      guards.length ? [`guards: ${guards.map((guard) => guardLabelOf(guard, labels)).join(", ")}`] : [];
    const names = moduleNames(refName);
    const serviceClass = facts.flatMap((file) => file.services).find((item) => item.model === refName);
    const sliceClass = group.slices[0];
    const modelDoc = facts.flatMap((file) => file.models).find((item) => item.model === refName);
    const filterClass = facts.flatMap((file) => file.filters).find((item) => item.name === names.FilterClass);

    if (serviceClass) {
      const target = { ...base, family: "module" as const, sourceKey: serviceClass.name, span: serviceClass.span };
      this.#add({ ...target, name: names.service, role: "service", gate: null, label: serviceClass.name, detail: [] });
      this.#add({ ...target, name: refName, role: "srv", gate: "srv", label: serviceClass.name, detail: [] });
    }
    if (sliceClass)
      this.#add({
        ...base,
        family: "module",
        sourceKey: sliceClass.name,
        span: sliceClass.span,
        name: refName,
        role: "sig",
        gate: "sig",
        label: sliceClass.name,
        detail: guarded(sliceClass.guards),
      });
    if (modelDoc)
      this.#add({
        ...base,
        family: "module",
        sourceKey: modelDoc.name,
        span: modelDoc.span,
        name: refName,
        role: "db",
        gate: "db",
        label: modelDoc.name,
        detail: [],
      });

    const modelRoles = modelNames(refName);
    const modelNameSet = new Set(Object.values(modelRoles));
    if (modelClass) {
      const target = { ...base, family: "model" as const, sourceKey: modelClass.name, span: modelClass.span };
      for (const [role, name] of Object.entries(modelRoles))
        this.#add({
          ...target,
          name,
          role,
          gate: role === "model" ? "state" : null,
          label: `model ${Model}`,
          detail: [],
        });
      for (const [role, name] of Object.entries(databaseStateNames(refName)))
        this.#add({
          ...target,
          name: stateSetterName(name),
          role: `set:${role}`,
          gate: null,
          label: `model ${Model}`,
          detail: [],
        });
      for (const field of NameTable.#fieldsOf(modelClass, constants)) {
        const setters = formSetterNames(Model, field.name);
        for (const role of [
          "setFieldOnModel",
          "addFieldOnModel",
          "subFieldOnModel",
          "addOrSubFieldOnModel",
          "uploadFieldOnModel",
        ] as const)
          this.#add({
            ...base,
            family: "formSetter",
            sourceKey: field.name,
            span: field.span,
            name: setters[role],
            role,
            gate: null,
            label: `field ${field.declaredIn}.${field.name}`,
            detail: [],
          });
      }
    }

    for (const slice of group.slices) {
      const defaultTarget = {
        ...base,
        family: "slice" as const,
        sourceKey: slice.name,
        span: slice.span,
        label: `slice ${refName} (default)`,
        detail: guarded(slice.guards),
      };
      this.#addSliceNames(defaultTarget, refName, "", modelNameSet);
      for (const key of slice.keys)
        this.#addSliceNames(
          {
            ...base,
            family: "slice",
            sourceKey: key.name,
            span: key.span,
            label: `slice ${key.name}`,
            detail: [...guarded(key.guards), ...(key.live ? ["live"] : [])],
          },
          refName,
          key.name,
          modelNameSet,
          slice.name,
        );
    }

    if (filterClass) {
      const defaults = { ...base, family: "query" as const, detail: [] };
      for (const [role, name] of Object.entries(queryNames("any")))
        this.#add({
          ...defaults,
          sourceKey: filterClass.name,
          span: filterClass.span,
          name,
          role,
          gate: null,
          label: `query any (default) of ${filterClass.name}`,
        });
      for (const query of filterClass.queries)
        for (const [role, name] of Object.entries(queryNames(query.name)) as [
          keyof ReturnType<typeof queryNames>,
          string,
        ][])
          this.#add({
            ...defaults,
            sourceKey: query.name,
            span: query.span,
            name,
            role,
            gate: null,
            label: `query ${query.name}`,
            renamed: (key) => queryNames(key)[role],
            dictionary: { section: "query", className: filterClass.name },
          });
    }

    for (const store of facts.flatMap((file) => file.stores).filter((item) => item.model === refName))
      for (const key of store.stateKeys)
        this.#add({
          ...base,
          family: "storeState",
          sourceKey: key.name,
          span: key.span,
          name: stateSetterName(key.name),
          role: "set",
          gate: null,
          label: `store state ${key.name}`,
          detail: [],
        });

    for (const endpoint of facts.flatMap((file) => file.endpoints).filter((item) => item.model === refName))
      for (const key of endpoint.keys) {
        const derived = endpointNames(key.name);
        const name = key.verb === "pubsub" ? derived.subscribe : key.verb === "message" ? derived.listen : null;
        if (!name) continue;
        this.#add({
          ...base,
          family: "endpoint",
          sourceKey: key.name,
          span: key.span,
          name,
          role: key.verb === "pubsub" ? "subscribe" : "listen",
          gate: null,
          label: `${key.verb} ${key.name}`,
          detail: guarded(key.guards),
        });
      }
  }

  static #sliceRoles(refName: string, suffix: string) {
    const names = sliceNames(refName, suffix);
    return new Map<string, string>([
      ["slice", names.slice],
      ...Object.entries(names.state),
      ...Object.entries(names.action),
      ...Object.entries(names.endpoint),
      ...Object.entries(names.state).map(([role, name]): [string, string] => [`set:${role}`, stateSetterName(name)]),
    ]);
  }

  #addSliceNames(
    target: Omit<AkanEntry, "name" | "role" | "gate">,
    refName: string,
    suffix: string,
    skip: Set<string>,
    className?: string,
  ) {
    for (const [role, name] of NameTable.#sliceRoles(refName, suffix)) {
      if (!suffix && role !== "slice" && skip.has(name)) continue;
      this.#add({
        ...target,
        name,
        role,
        gate: role === "slice" ? "slice" : null,
        ...(suffix && className
          ? {
              renamed: (key: string) => NameTable.#sliceRoles(refName, key).get(role) ?? name,
              dictionary: { section: "slice" as const, className },
            }
          : {}),
      });
    }
  }

  static #fieldsOf(modelClass: ConstantClassFact, { own, libs }: ConstantScope) {
    const classNamed = (name: string, near: ConstantClassFact) =>
      own.find((constant) => constant.name === name && constant.span.fileName === near.span.fileName) ??
      own.find((constant) => constant.name === name) ??
      libs.find((constant) => constant.name === name);
    const fields = new Map<string, NamedFact & { declaredIn: string }>();
    const seen = new Set<ConstantClassFact>();
    const visit = (constant: ConstantClassFact) => {
      if (seen.has(constant)) return;
      seen.add(constant);
      for (const field of constant.fields)
        if (!fields.has(field.name)) fields.set(field.name, { ...field, declaredIn: constant.name });
      for (const parent of constant.parents) {
        const parentClass = classNamed(parent, constant);
        if (parentClass) visit(parentClass);
      }
    };
    visit(modelClass);
    return [...fields.values()];
  }
}
