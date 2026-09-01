import { actionTagOf } from "akanjs/store";

/**
 * The `data-akan-*` attributes for a handler the caller passed by reference.
 *
 * `{}` when the handler is an inline arrow, which is the honest answer: a closure the caller wrote says nothing
 * about what it does, and a guessed annotation is worse than none. The house form for a model field is the setter
 * itself (`onChange={st.do.setNameOnUser}`), so the fields that matter are annotated without an app writing anything.
 *
 * What it buys, beyond an in-page agent: an accessibility tree and E2E selectors that name the action rather than a
 * class, and an external browser agent — one this framework has no bridge into — reading the same names.
 */
export const agentAttrs = (
  handler: unknown,
): { "data-akan-action"?: string; "data-akan-state"?: string } | Record<string, never> => {
  const tag = actionTagOf(handler);
  if (!tag) return {};
  return { "data-akan-action": tag.action, ...(tag.state ? { "data-akan-state": tag.state } : {}) };
};
