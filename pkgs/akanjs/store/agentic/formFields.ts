import { type Cls, FIELD_META, PrimitiveRegistry } from "akanjs/base";
import { capitalize } from "akanjs/common";
import { type ConstantField, ConstantRegistry, type ParamFieldType } from "akanjs/constant";
import type { JsonSchema } from "use-agentic";
import { formSetterNames } from "../formSetterNames";
import { StToolBuilder } from "./StToolBuilder";

export interface FormFieldRef {
  refName: string;
  key: string;
  field: ConstantField;
}

/** Written by the document layer, never by the person at the form. */
const baseFields = new Set(["id", "createdAt", "updatedAt", "removedAt"]);
const MAX_DEPTH = 4;

/**
 * What a form's fields look like to an agent: which setter action belongs to which field, what shape a value for
 * it has, and whether a value it sent is one that field accepts.
 *
 * The action-to-field map is built **forward** from `formSetterNames`, never by taking a name apart:
 * `set(.+)On(.+)` has more than one reading whenever a field or a model name contains `On`.
 */
export class FormFields {
  static #index: Map<string, FormFieldRef> | null = null;

  /** Every `set<Field>On<Model>` this client knows, against the field it writes. */
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

  /** The fields of a model's form an agent may write, with the setter each one answers to. */
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

  /**
   * The shape a value for one field has, or null when there is nothing honest to publish.
   *
   * A relation is left out rather than described as its id: the form holds the whole related document, so writing
   * an id would need a lookup the store does not do — a relation is picked or uploaded, never typed. `hidden`,
   * `secret`, and `resolve` are out at every level, the first two because their reads are masked and a writer for
   * one would be the door around that, the last because it is computed and has no setter at all.
   */
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

  /**
   * The value the store should receive, or a throw naming what was wrong with the one that arrived.
   *
   * `additionalProperties: false` travels in the published schema and nothing on the wire enforces it, so an
   * undeclared key is reported here rather than written into the form and shipped on the next submit.
   */
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

  /** A field no annotated control can ever name: its rows are written through `writeOn<Model>(path, value)`. */
  static isComposite(field: ConstantField) {
    return field.arrDepth > 0 || (field.modelRef as unknown) === Map || !!FormFields.#scalarModel(field);
  }

  /**
   * The embedded model an array field's rows are, or null for every other field.
   *
   * This is the one shape where writing the whole array is a hazard rather than an inconvenience: the agent has to
   * echo every row it is *not* changing, `checked` validates types and not values, so one mistyped row it was never
   * asked to touch is written silently. A relation array is excluded — its rows travel as ids, which are the payload
   * and are refused by name when wrong — and so is an array of primitives, for the same reason.
   */
  static rowModelOf(field: ConstantField) {
    return field.arrDepth > 0 ? FormFields.#scalarModel(field) : null;
  }

  static #scalarModel(field: ConstantField) {
    const modelRef = field.modelRef as unknown as Cls;
    if (field.enum || PrimitiveRegistry.has(modelRef)) return null;
    return ConstantRegistry.isScalar(modelRef) ? modelRef : null;
  }
}
