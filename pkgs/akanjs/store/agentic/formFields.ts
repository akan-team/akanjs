import { type Cls, FIELD_META, PrimitiveRegistry } from "akanjs/base";
import { capitalize, formSetterNames } from "akanjs/common";
import { type ConstantField, ConstantRegistry, type ParamFieldType } from "akanjs/constant";
import type { JsonSchema } from "use-agentic";
import { StToolBuilder } from "./StToolBuilder";

export interface FormFieldRef {
  refName: string;
  key: string;
  field: ConstantField;
}

const baseFields = new Set(["id", "createdAt", "updatedAt", "removedAt"]);
const MAX_DEPTH = 4;

export class FormFields {
  static #index: Map<string, FormFieldRef> | null = null;

  static ref(action: string): FormFieldRef | null {
    FormFields.#index ??= FormFields.#buildIndex();
    return FormFields.#index.get(action) ?? null;
  }

  static #buildIndex() {
    const index = new Map<string, FormFieldRef>();
    for (const refName of ConstantRegistry.database.keys()) {
      const className = capitalize(refName);
      for (const [key, field] of Object.entries(
        ConstantRegistry.getDatabase(refName).full[FIELD_META] as { [key: string]: ConstantField },
      ))
        index.set(formSetterNames(className, key).setFieldOnModel, { refName, key, field });
    }
    return index;
  }

  static patchable(refName: string): { key: string; action: string; field: ConstantField; schema: JsonSchema }[] {
    const className = capitalize(refName);
    const model = ConstantRegistry.getDatabase(refName);
    const inputFields = model.input[FIELD_META] as { [key: string]: ConstantField };
    return Object.entries(model.full[FIELD_META] as { [key: string]: ConstantField })
      .filter(([key]) => key in inputFields && !baseFields.has(key))
      .flatMap(([key, field]) => {
        const schema = FormFields.schema(field);
        return schema ? [{ key, action: formSetterNames(className, key).setFieldOnModel, field, schema }] : [];
      });
  }

  /** Null for a relation (picked, never typed) and for hidden/secret/resolve, whose writer would bypass the mask. */
  static schema(field: ConstantField, depth = 0): JsonSchema | null {
    if (field.fieldType !== "property" || depth > MAX_DEPTH) return null;
    const leaf = FormFields.#leafSchema(field, depth);
    if (!leaf) return null;
    let schema = leaf;
    for (let arr = 0; arr < field.arrDepth; arr += 1) schema = { type: "array", items: schema };
    return schema;
  }

  static #leafSchema(field: ConstantField, depth: number): JsonSchema | null {
    const modelRef = field.modelRef as unknown as Cls;
    if (field.enum) return StToolBuilder.schemaOf(field.enum as unknown as ParamFieldType);
    if ((modelRef as unknown) === Map) {
      const value = field.of ? FormFields.#ofSchema(field) : null;
      return value ? { type: "object", additionalProperties: value } : null;
    }
    if (PrimitiveRegistry.has(modelRef)) {
      // Only its own editor may write it — it can refuse a lossy rewrite a setter here would take around it.
      if (PrimitiveRegistry.agentOf(modelRef)) return null;
      try {
        return StToolBuilder.schemaOf(modelRef as unknown as ParamFieldType);
      } catch {
        // `Any` and `Upload` have no shape to publish; the same refusal the MCP surface makes for them.
        return null;
      }
    }
    if (!ConstantRegistry.isScalar(modelRef)) return null;
    return FormFields.#objectSchema(modelRef, depth);
  }

  static #ofSchema(field: ConstantField): JsonSchema | null {
    if (PrimitiveRegistry.agentOf(field.of)) return null;
    try {
      return StToolBuilder.schemaOf(field.of as unknown as ParamFieldType);
    } catch {
      return null;
    }
  }

  static #objectSchema(modelRef: Cls, depth: number): JsonSchema | null {
    const entries = Object.entries(
      (modelRef as unknown as { [key: symbol]: unknown })[FIELD_META] as {
        [key: string]: ConstantField;
      },
    ).flatMap(([key, inner]) => {
      const schema = FormFields.schema(inner, depth + 1);
      return schema ? [[key, schema] as const] : [];
    });
    if (!entries.length) return null;
    return { type: "object", properties: Object.fromEntries(entries), additionalProperties: false };
  }

  /** Throws on a bad value: nothing on the wire enforces the published schema, `additionalProperties` included. */
  static checked(action: string, path: string, field: ConstantField, value: unknown, depth = 0): unknown {
    if (value === null) {
      if (!field.nullable) throw new Error(`"${path}" of ${action} does not take null.`);
      return null;
    }
    if (field.arrDepth > 0) return FormFields.#checkedArray(action, path, field, value, depth);
    const modelRef = field.modelRef as unknown as Cls;
    if ((modelRef as unknown) === Map) return FormFields.#checkedMap(action, path, field, value);
    if (field.enum || PrimitiveRegistry.has(modelRef))
      return StToolBuilder.checkedValue(action, path, (field.enum ?? modelRef) as unknown as ParamFieldType, value);
    return FormFields.#checkedObject(action, path, modelRef, value, depth);
  }

  static #checkedArray(action: string, path: string, field: ConstantField, value: unknown, depth: number) {
    if (!Array.isArray(value)) throw new Error(`"${path}" of ${action} must be an array.`);
    const inner = Object.assign(Object.create(Object.getPrototypeOf(field) as object), field, {
      arrDepth: field.arrDepth - 1,
      nullable: false,
    }) as ConstantField;
    return value.map((item, idx) => FormFields.checked(action, `${path}[${idx}]`, inner, item, depth));
  }

  static #checkedMap(action: string, path: string, field: ConstantField, value: unknown) {
    if (!FormFields.#isPlainObject(value)) throw new Error(`"${path}" of ${action} must be an object.`);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        StToolBuilder.checkedValue(action, `${path}.${key}`, field.of as unknown as ParamFieldType, item),
      ]),
    );
  }

  static #checkedObject(action: string, path: string, modelRef: Cls, value: unknown, depth: number) {
    if (!FormFields.#isPlainObject(value)) throw new Error(`"${path}" of ${action} must be an object.`);
    const fields = (modelRef as unknown as { [key: symbol]: unknown })[FIELD_META] as {
      [key: string]: ConstantField;
    };
    const entries = Object.entries(value).map(([key, item]) => {
      const inner = fields[key];
      if (!inner || !FormFields.schema(inner, depth + 1))
        throw new Error(`"${path}" of ${action} has no field "${key}".`);
      return [key, FormFields.checked(action, `${path}.${key}`, inner, item, depth + 1)] as const;
    });
    return Object.fromEntries(entries);
  }

  static #isPlainObject(value: unknown): value is { [key: string]: unknown } {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  /** Shared by both picker hooks on purpose, so a model that learned it on one field spells it the same on the next. */
  static optionsToolName(refName: string, key: string): string {
    return `load${capitalize(key)}OptionsOn${capitalize(refName)}`;
  }

  /** The database model a relation field points at, else null. */
  static relationOf(field: ConstantField): string | null {
    const modelRef = field.modelRef as unknown as Cls;
    if (field.fieldType !== "property" || field.enum || !modelRef || PrimitiveRegistry.has(modelRef)) return null;
    const refName = ConstantRegistry.getRefName(modelRef, { allowEmpty: true });
    return refName && ConstantRegistry.database.has(refName) ? refName : null;
  }

  /** A field no annotated control can ever name: its rows are written through `writeOn<Model>(path, value)`. */
  static isComposite(field: ConstantField) {
    return field.arrDepth > 0 || (field.modelRef as unknown) === Map || !!FormFields.#scalarModel(field);
  }

  /** The embedded model of an array field's rows, else null — relation and primitive arrays included. */
  static rowModelOf(field: ConstantField) {
    return field.arrDepth > 0 ? FormFields.#scalarModel(field) : null;
  }

  static #scalarModel(field: ConstantField) {
    const modelRef = field.modelRef as unknown as Cls;
    if (field.enum || PrimitiveRegistry.has(modelRef)) return null;
    return ConstantRegistry.isScalar(modelRef) ? modelRef : null;
  }
}
