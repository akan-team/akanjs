import { FIELD_META } from "akanjs/base";

/**
 * A model as masking reads it — the constructor, for the field metadata it carries at runtime.
 *
 * Structural rather than `ConstantModelRef` so that anything holding the class can name it, and read through
 * `FIELD_META` the way `resolveReturn` reads it.
 */
export interface MaskModel {
  name: string;
}

/** The part of a field's metadata masking turns on. Mirrors what `resolveReturn` branches over. */
interface MaskField {
  fieldType?: string;
  isClass?: boolean;
  modelRef?: MaskModel;
  visual?: boolean;
}

export const maskFieldsOf = (model: MaskModel): Record<string, MaskField> | null => {
  const fields = (model as unknown as { [key: symbol]: unknown })[FIELD_META];
  return fields && typeof fields === "object" ? (fields as Record<string, MaskField>) : null;
};

/**
 * The `hidden` and `secret` field names of `model` that `value` still carries populated.
 *
 * `visual` is deliberately not among them. A refusal here means a value must not be published at all, and a blur
 * placeholder is not a secret — it is merely not worth its tokens, which masking answers by dropping it.
 */
export const leakingFieldsOf = (model: MaskModel, value: Record<string, unknown>): string[] => {
  const fields = maskFieldsOf(model);
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([key, field]) => (field.fieldType === "hidden" || field.fieldType === "secret") && key in value)
    .map(([key]) => key);
};

/**
 * Strips what a model marks `hidden`, `secret`, or `visual`, by the model the caller names rather than by the one
 * the value happens to still carry. The first two are secrecy and the third is cost, but the answer is the same
 * one — leave the field out — and this is the only place every AI-facing read already passes through.
 *
 * That distinction is the whole point. A check that reads the class off the value can only mask what arrives as an
 * instance, so a `{ ...doc }` spread, a `toJSON()`, an `immerify()`, or a round-trip through `JSON.stringify` reaches
 * its destination with the metadata already gone and nothing can be done about it. A named model is metadata the
 * value cannot lose, so a hydrated document and a plain object copied out of one mask identically.
 *
 * This is the field half of `resolveReturn` and deliberately not the whole of it. That one also loads every relation
 * it walks past, which is right for a query's return value and wrong here, where the value is already in hand.
 *
 * Returns `unknown` rather than the argument's type, because what comes back is missing fields that type promises.
 */
export const mask = (model: MaskModel, value: unknown): unknown => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item: unknown) => mask(model, item));
  const fields = maskFieldsOf(model);
  if (!fields) return value;
  const source = value as Record<string, unknown>;
  const masked: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.fieldType === "hidden" || field.fieldType === "secret" || field.visual || !(key in source)) continue;
    masked[key] = field.isClass && field.modelRef ? mask(field.modelRef, source[key]) : source[key];
  }
  return masked;
};
