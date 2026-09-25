import { type Cls, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import type { ConstantField, FieldObject } from "./fieldInfo";
import { TextFieldPathSet } from "./textFieldPathSet";

/** Column a `text` field feeds in the `search_doc` mirror. */
export const textFieldRoles = ["title", "desc", "tag", "thumb", "filter"] as const;
export type TextFieldRole = (typeof textFieldRoles)[number];

// `thumb` and `filter` carry identifiers rather than prose, so they also accept `ID` and model references.
const refRoles = new Set<TextFieldRole>(["thumb", "filter"]);

export class TextFieldPaths extends TextFieldPathSet {
  readonly children = new TextFieldPathSet();

  collect(fieldMap: FieldObject) {
    for (const [key, field] of Object.entries(fieldMap)) {
      if (field.text) {
        this.#assertIndexable(key, field.text, field);
        this[field.text].add(key);
      }
      // Scalar children are embedded in `_doc`, so their paths stay addressable. A relation stores only an id, so
      // recursing into one yields paths that never exist in the stored document.
      if (field.isClass && field.isScalar) this.#mergeChild(key, field);
    }
    return this;
  }

  #mergeChild(key: string, parent: ConstantField) {
    const child = parent.modelRef.text as TextFieldPaths;
    for (const role of textFieldRoles) {
      for (const path of [...child[role], ...child.children[role]]) {
        this.#assertReachable(`${key}.${path}`, parent);
        this.children[role].add(`${key}.${path}`);
      }
    }
  }

  // A child path reaches the mirror through its parent, so an unreadable or unaddressable parent has to fail the
  // class build the same way the leaf itself would. Checking only the leaf leaves the secret's own subtree open:
  // `_doc` stores a secret in plaintext, so every text field under it would be published through search.
  #assertReachable(path: string, parent: ConstantField) {
    if (parent.fieldType === "secret") throw new Error(`Text field "${path}" is under a secret field`);
    if (parent.fieldType === "hidden") throw new Error(`Text field "${path}" is under a hidden field`);
    if (parent.fieldType === "resolve") throw new Error(`Text field "${path}" is under a resolved field`);
    if (parent.arrDepth > 1) throw new Error(`Text field "${path}" is under a nested array and cannot be indexed`);
  }

  #assertIndexable(key: string, role: TextFieldRole, field: ConstantField) {
    // A secret field reaching the mirror would surface it in every search result, so fail the class build instead.
    if (field.fieldType === "secret") throw new Error(`Text field "${key}" is secret and must not be indexed`);
    if (field.fieldType === "hidden") throw new Error(`Text field "${key}" is hidden and must not be indexed`);
    if (field.fieldType === "resolve") throw new Error(`Text field "${key}" is resolved and is absent from _doc`);
    if (field.isMap) throw new Error(`Text field "${key}" is a Map and cannot be indexed`);
    if (field.arrDepth > 1) throw new Error(`Text field "${key}" is a nested array and cannot be indexed`);
    const modelRef = field.modelRef as unknown as Cls;
    const refName = PrimitiveRegistry.has(modelRef)
      ? PrimitiveRegistry.getName(modelRef as unknown as typeof PrimitiveScalar)
      : null;
    if (refName === "String") return;
    if (refRoles.has(role) && (refName === "ID" || (field.isClass && !field.isScalar))) return;
    const accepted = refRoles.has(role) ? "String, ID, or a model reference" : "String";
    throw new Error(`Text field "${key}" declares text: "${role}", which accepts ${accepted}`);
  }
}
