import { actionTagOf } from "../store/actionTag";

/** `data-akan-*` attributes for a handler passed by reference, `{}` for an inline arrow. `key` tells apart the
 *  controls sharing one handler (a tab's menus, a list's rows), in the vocabulary of the call's argument. */
export const agentAttrs = (
  handler: unknown,
  key?: string | number,
): { "data-akan-action"?: string; "data-akan-state"?: string; "data-akan-key"?: string } | Record<string, never> => {
  const tag = actionTagOf(handler);
  if (!tag) return {};
  return {
    "data-akan-action": tag.action,
    ...(tag.state ? { "data-akan-state": tag.state } : {}),
    ...(key === undefined || key === "" ? {} : { "data-akan-key": String(key) }),
  };
};
