import { type Cls, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import type { ConstantField, FieldObject } from "./fieldInfo";
import type { ConstantModelRef } from "./via";

/**
 * Which end of a relation goes away with the other. `removeRef` removes what the field points at when this
 * document is removed; `removeWith` removes this document when what the field points at is removed. The two
 * read identically on a relation field, so the value has to name the direction — a mistake here is a data loss.
 */
export const cascadeActions = ["removeRef", "removeWith"] as const;
export type CascadeAction = (typeof cascadeActions)[number];

/** How a `removeWith` field names the owner whose removal takes this document with it. */
export interface CascadeWithPath {
  readonly key: string;
  /** Set when the field is a relation. Resolved to a refName later: the owner may not be registered yet. */
  readonly modelRef: ConstantModelRef | null;
  /** Set when the field declares `ref`, which names the owner at declaration. */
  readonly refName: string | null;
  /** Set when the field declares `refPath`: the sibling field holding the owner's refName. */
  readonly typeKey: string | null;
  /** The refNames `typeKey` may hold. Empty unless the field is polymorphic. */
  readonly typeValues: readonly string[];
}

const idNames = new Set(["ID", "String"]);

export class CascadePaths {
  /** Field key → the model its ids point at, removed when this document is. */
  readonly removeRef = new Map<string, ConstantModelRef>();
  /** Field key → the owner whose removal removes this document. */
  readonly removeWith = new Map<string, CascadeWithPath>();

  collect(fieldMap: FieldObject) {
    for (const [key, field] of Object.entries(fieldMap)) {
      if (!field.cascade) continue;
      this.#assertKnownAction(key, field.cascade);
      if (field.cascade === "removeRef") this.removeRef.set(key, this.#readOwnedRelation(key, field));
      else this.removeWith.set(key, this.#readOwnerPath(key, field, fieldMap));
    }
    return this;
  }

  #assertKnownAction(key: string, action: CascadeAction) {
    // A macro import and a bundled build both reach the collector without a typecheck, so the union alone is not
    // enough: an unknown action would otherwise be dropped and the field would look wired up.
    if (!cascadeActions.includes(action)) {
      throw new Error(`Cascade field "${key}" declares cascade: "${action}", which is not one of ${cascadeActions}`);
    }
  }

  #readOwnedRelation(key: string, field: ConstantField) {
    // A scalar is embedded in `_doc` and has no document of its own to remove; a primitive holds no id at all.
    if (!field.isClass || field.isScalar) {
      throw new Error(`Cascade field "${key}" is not a model reference and has no document to remove`);
    }
    if (field.arrDepth > 1) throw new Error(`Cascade field "${key}" is a nested array and cannot cascade`);
    return field.modelRef;
  }

  #readOwnerPath(key: string, field: ConstantField, fieldMap: FieldObject): CascadeWithPath {
    // Several owners would make the removal ambiguous: whether losing one of them is enough is a per-model rule
    // the framework cannot guess, so it is left to the module's own `_postRemove`.
    if (field.arrDepth > 0) throw new Error(`Cascade field "${key}" is an array and names more than one owner`);
    if (field.isMap) throw new Error(`Cascade field "${key}" is a Map and names no owner`);
    if (field.refPath) return this.#readPolymorphicOwner(key, field, fieldMap);
    if (field.ref) {
      this.#assertHoldsId(key, field);
      return { key, modelRef: null, refName: field.ref, typeKey: null, typeValues: [] };
    }
    if (field.isClass && !field.isScalar) {
      return { key, modelRef: field.modelRef, refName: null, typeKey: null, typeValues: [] };
    }
    throw new Error(
      `Cascade field "${key}" declares cascade: "removeWith" but names no owner; make it a model reference, ` +
        `or add ref: "<model>" / refPath: "<typeField>"`,
    );
  }

  #readPolymorphicOwner(key: string, field: ConstantField, fieldMap: FieldObject): CascadeWithPath {
    if (field.ref) throw new Error(`Cascade field "${key}" declares both ref and refPath; keep one`);
    this.#assertHoldsId(key, field);
    const typeKey = field.refPath as string;
    const typeField = fieldMap[typeKey];
    if (!typeField) throw new Error(`Cascade field "${key}" declares refPath: "${typeKey}", which is not a field`);
    // A free-form owner type is unknowable at build time, so every model's removal would have to sweep this table
    // on the chance it is the owner. An enum names the candidates, and the reverse index then reaches only them.
    if (!typeField.enum) {
      throw new Error(
        `Cascade field "${key}" declares refPath: "${typeKey}", which must be an enumOf(...) naming the owner ` +
          `refNames it may hold`,
      );
    }
    const typeValues = typeField.enum.values.map((value) => String(value));
    return { key, modelRef: null, refName: null, typeKey, typeValues };
  }

  #assertHoldsId(key: string, field: ConstantField) {
    const modelRef = field.modelRef as unknown as Cls;
    const refName = PrimitiveRegistry.has(modelRef)
      ? PrimitiveRegistry.getName(modelRef as unknown as typeof PrimitiveScalar)
      : null;
    if (refName && idNames.has(refName)) return;
    throw new Error(`Cascade field "${key}" declares ref or refPath and must hold an ID`);
  }
}
