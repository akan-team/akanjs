import {
  type Cls,
  type EnumInstance,
  FIELD_META,
  getNonArrayModel,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { type ConstantCls, type ConstantField, ConstantRegistry, type ConstantType } from "akanjs/constant";
import { DatabaseRegistry, type FilterInfo, getFilterMeta } from "akanjs/document";
import { DevtoolsJson } from "./devtoolsJson";
import type {
  ConstantData,
  ConstantFieldNode,
  ConstantModelNode,
  ConstantModelView,
  ConstantModelViewKey,
  EnumNode,
  FieldType,
  FilterArg,
  RelationEdge,
} from "./types";

const modelViewKeys = ["input", "object", "full", "light", "insight"] as const;

/**
 * Walks `ConstantRegistry` into the `/_akan/constant` payload.
 *
 * Model references are emitted by name only, never inlined, so a cyclic schema still produces a finite
 * document. Anything the registry holds that JSON cannot express goes through {@link DevtoolsJson}.
 */
export class ConstantSerializer {
  static serialize(): ConstantData {
    const models: Record<string, ConstantModelNode> = {};
    const relations: RelationEdge[] = [];
    for (const [refName, cnst] of ConstantRegistry.database.entries()) {
      const views = {} as Record<ConstantModelViewKey, ConstantModelView>;
      const modelNames = {} as Record<ConstantModelViewKey, string>;
      for (const viewKey of modelViewKeys) {
        const view = ConstantSerializer.#serializeView(cnst[viewKey] as ConstantCls, viewKey);
        views[viewKey] = view;
        modelNames[viewKey] = view.modelName;
        relations.push(...ConstantSerializer.#collectRelations(refName, view));
      }
      models[refName] = {
        refName,
        modelNames,
        views,
        ...ConstantSerializer.#serializeFilter(refName),
      };
    }

    const scalars: Record<string, ConstantModelView> = {};
    for (const [refName, scalar] of ConstantRegistry.scalar.entries()) {
      scalars[refName] = ConstantSerializer.#serializeView(scalar.model, "scalar");
    }

    const enums: Record<string, EnumNode> = {};
    for (const [key, enumRef] of ConstantRegistry.enum.entries()) {
      enums[key] = { key, refName: enumRef.refName, values: [...enumRef.values] as (string | number)[] };
    }

    const values: Record<string, unknown> = {};
    for (const [key, value] of ConstantRegistry.value.entries()) {
      values[key] = DevtoolsJson.toSafe(value);
    }

    return { models, scalars, enums, values, primitives: PrimitiveRegistry.getNames().sort(), relations };
  }

  static #serializeView(modelRef: ConstantCls | undefined, modelType: ConstantType): ConstantModelView {
    const fieldMeta = (modelRef as { [FIELD_META]?: Record<string, ConstantField> } | undefined)?.[FIELD_META] ?? {};
    const fields: Record<string, ConstantFieldNode> = {};
    for (const [name, field] of Object.entries(fieldMeta)) {
      fields[name] = ConstantSerializer.#serializeField(name, field);
    }
    return {
      modelName: modelRef ? ConstantRegistry.getModelName(modelRef) : "Unknown",
      modelType,
      fields,
    };
  }

  static #serializeField(name: string, field: ConstantField): ConstantFieldNode {
    const props = field.getProps();
    const fieldKind = props.fieldType ?? "property";
    // Field names describe structure; seeded values on a secret field do not (see the Secrets rule in AGENTS.md).
    const redacted = fieldKind === "secret";
    const defaultKind = ConstantSerializer.#resolveDefaultKind(props.default);
    return {
      name,
      fieldKind,
      type: ConstantSerializer.#resolveFieldType(props),
      arrDepth: props.arrDepth,
      nullable: Boolean(props.nullable),
      immutable: Boolean(props.immutable),
      select: props.select !== false,
      defaultKind: redacted && defaultKind === "value" ? "none" : defaultKind,
      ...(!redacted && defaultKind === "value" ? { default: DevtoolsJson.toSafe(props.default) } : {}),
      ...(props.ref ? { ref: props.ref } : {}),
      ...(props.refPath ? { refPath: props.refPath } : {}),
      ...(props.refType ? { refType: props.refType } : {}),
      ...(props.min !== undefined ? { min: props.min } : {}),
      ...(props.max !== undefined ? { max: props.max } : {}),
      ...(props.minlength !== undefined ? { minlength: props.minlength } : {}),
      ...(props.maxlength !== undefined ? { maxlength: props.maxlength } : {}),
      ...(props.type ? { preset: props.type } : {}),
      ...(props.text ? { text: props.text } : {}),
      ...(props.accumulate !== undefined ? { accumulate: DevtoolsJson.toSafe(props.accumulate) } : {}),
      ...(!redacted && props.example !== undefined && props.example !== null
        ? { example: DevtoolsJson.toSafe(props.example) }
        : {}),
      ...(props.meta && Object.keys(props.meta).length
        ? { meta: DevtoolsJson.toSafe(props.meta) as Record<string, unknown> }
        : {}),
      hasValidate: typeof props.validate === "function",
    };
  }

  /** `default: () => dayjs()` is idiomatic here — report the factory without ever invoking it. */
  static #resolveDefaultKind(value: unknown): ConstantFieldNode["defaultKind"] {
    if (typeof value === "function") return "function";
    if (value === null || value === undefined) return "none";
    return "value";
  }

  static #resolveFieldType(props: ReturnType<ConstantField["getProps"]>): FieldType {
    if (props.enum) return ConstantSerializer.#enumType(props.enum);
    if (props.isMap) {
      const [valueRef, valueArrDepth] = getNonArrayModel(props.of as Cls);
      return { kind: "map", value: ConstantSerializer.#resolveModelRef(valueRef as Cls), valueArrDepth };
    }
    return ConstantSerializer.#resolveModelRef(props.modelRef as Cls);
  }

  static #enumType(enumRef: EnumInstance): FieldType {
    return { kind: "enum", refName: enumRef.refName, values: [...enumRef.values] as (string | number)[] };
  }

  static #resolveModelRef(modelRef: Cls): FieldType {
    if (isEnum(modelRef)) return ConstantSerializer.#enumType(modelRef as unknown as EnumInstance);
    if (PrimitiveRegistry.has(modelRef))
      return { kind: "primitive", refName: PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar) };
    const refName = ConstantRegistry.getRefName(modelRef, { allowEmpty: true });
    if (!refName) return { kind: "unknown", refName: modelRef.name || "Unknown" };
    return {
      kind: "model",
      refName,
      modelType: (modelRef as ConstantCls).modelType ?? "scalar",
      modelName: ConstantRegistry.getModelName(modelRef),
    };
  }

  static #collectRelations(refName: string, view: ConstantModelView): RelationEdge[] {
    return Object.values(view.fields)
      .filter((field) => field.type.kind === "model")
      .map((field) => {
        const type = field.type as Extract<FieldType, { kind: "model" }>;
        return {
          from: refName,
          fromView: view.modelType,
          field: field.name,
          to: type.refName,
          toView: type.modelType,
          arrDepth: field.arrDepth,
          nullable: field.nullable,
          ...(field.refType ? { refType: field.refType } : {}),
        };
      });
  }

  static #serializeFilter(refName: string): Pick<ConstantModelNode, "filter"> {
    const database = DatabaseRegistry.getDatabase(refName, { allowEmpty: true });
    const filterMeta = database?.filter ? getFilterMeta(database.filter, { allowEmpty: true }) : undefined;
    if (!filterMeta) return {};
    const query: Record<string, FilterArg[]> = {};
    for (const [key, filterInfo] of Object.entries(filterMeta.query as Record<string, FilterInfo>)) {
      query[key] = (filterInfo.args ?? []).map((arg) => ConstantSerializer.#serializeFilterArg(arg));
    }
    return { filter: { query, sort: Object.keys(filterMeta.sort ?? {}) } };
  }

  static #serializeFilterArg(arg: FilterInfo["args"][number]): FilterArg {
    const [single, arrDepth] = getNonArrayModel(arg.argRef as Cls);
    return {
      name: arg.name,
      type: ConstantSerializer.#resolveModelRef(single as Cls),
      arrDepth,
      nullable: Boolean(arg.option?.nullable),
      ...(arg.option?.ref ? { ref: arg.option.ref } : {}),
      ...(arg.option?.default !== undefined ? { default: DevtoolsJson.toSafe(arg.option.default) } : {}),
    };
  }
}
