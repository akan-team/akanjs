import { FIELD_META, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";

import type { ConstantField, FieldObject } from "./fieldInfo";

/**
 * What a response does with a field: leaves it out (`hidden` / `secret`), computes it (`resolve`), copies it (a
 * primitive or a Map), walks into it (an embedded scalar), or loads what it points at (a relation).
 */
export type FieldPlanKind = "masked" | "computed" | "value" | "scalar" | "relation";

export interface FieldPlanEntry {
  key: string;
  field: ConstantField;
  kind: FieldPlanKind;
  /** Points at another stored model, so an input carries its id; independent of `kind`, as `serialize` reads it. */
  isRelationRef: boolean;
  /** The scalar class of a primitive field, which `serialize` calls straight; `null` for everything else. */
  primitive: typeof PrimitiveScalar | null;
  serializeOption: { nullable: boolean; key: string };
}
interface PlanOwner {
  [FIELD_META]: FieldObject;
}

// One plan per model class, built from `FIELD_META` on first use and reset with `HydrationPlan` once a class is wired,
// because `fullModelOf` extends a lib model's `FIELD_META` in place.
export class FieldPlan {
  static #byClass = new WeakMap<object, FieldPlan>();
  static #generation = 0;
  static #computingAsync = new Set<FieldPlan>();
  static of(cls: PlanOwner): FieldPlan {
    const cached = FieldPlan.#byClass.get(cls);
    if (cached) return cached;
    const plan = new FieldPlan(cls[FIELD_META]);
    FieldPlan.#byClass.set(cls, plan);
    return plan;
  }
  static reset(cls: object) {
    FieldPlan.#byClass.delete(cls);
    FieldPlan.#generation += 1;
  }

  readonly entries: readonly FieldPlanEntry[];
  #resolvesAsync: { value: boolean; generation: number } | null = null;
  constructor(fieldObj: FieldObject) {
    this.entries = Object.entries(fieldObj).map(([key, field]) => ({
      key,
      field,
      kind: FieldPlan.#kindOf(field),
      isRelationRef: field.isClass && !field.isScalar,
      primitive: PrimitiveRegistry.has(field.modelRef) ? (field.modelRef as unknown as typeof PrimitiveScalar) : null,
      serializeOption: { nullable: field.nullable, key },
    }));
  }

  static #kindOf(field: ConstantField): FieldPlanKind {
    if (field.fieldType === "hidden" || field.fieldType === "secret") return "masked";
    if (field.fieldType === "resolve") return "computed";
    if (!field.isClass) return "value";
    return field.isScalar ? "scalar" : "relation";
  }

  /** Whether resolving a value of this class awaits anything: a relation, a resolve field, or one in a scalar below. */
  get resolvesAsync(): boolean {
    if (this.#resolvesAsync?.generation === FieldPlan.#generation) return this.#resolvesAsync.value;
    //? A scalar that reaches itself counts as async: the general path is right for every shape, the sync one is not.
    if (FieldPlan.#computingAsync.has(this)) return true;
    FieldPlan.#computingAsync.add(this);
    try {
      const value = this.entries.some(
        ({ kind, field }) =>
          kind === "computed" ||
          kind === "relation" ||
          (kind === "scalar" && FieldPlan.of(field.modelRef as unknown as PlanOwner).resolvesAsync),
      );
      this.#resolvesAsync = { value, generation: FieldPlan.#generation };
      return value;
    } finally {
      FieldPlan.#computingAsync.delete(this);
    }
  }
}
