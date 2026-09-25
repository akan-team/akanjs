import type { ConstantField, FieldObject } from "./fieldInfo";
import type { ConstantModelRef } from "./via";

/** What happens to the documents a relation field points at when the owner is removed. */
export const cascadeActions = ["remove"] as const;
export type CascadeAction = (typeof cascadeActions)[number];

export class CascadePaths {
  /** Field key → the model its ids point at. Resolved to a refName later: the target may not be registered yet. */
  readonly remove = new Map<string, ConstantModelRef>();

  collect(fieldMap: FieldObject) {
    for (const [key, field] of Object.entries(fieldMap)) {
      if (!field.cascade) continue;
      this.#assertCascadable(key, field.cascade, field);
      this.remove.set(key, field.modelRef);
    }
    return this;
  }

  #assertCascadable(key: string, action: CascadeAction, field: ConstantField) {
    // An action this build does not know would be dropped without a word, and the field would look wired up.
    if (!cascadeActions.includes(action)) {
      throw new Error(`Cascade field "${key}" declares cascade: "${action}", which is not one of ${cascadeActions}`);
    }
    // A scalar is embedded in `_doc` and has no document of its own to remove; a primitive holds no id at all.
    if (!field.isClass || field.isScalar) {
      throw new Error(`Cascade field "${key}" is not a model reference and has no document to remove`);
    }
    if (field.arrDepth > 1) throw new Error(`Cascade field "${key}" is a nested array and cannot cascade`);
  }
}
