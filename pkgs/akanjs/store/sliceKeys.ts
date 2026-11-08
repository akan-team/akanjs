import { sliceNames } from "akanjs/common";
import type { SliceActionKey } from "./sliceRole";
import type { SliceStateKey } from "./state";

type ExactRoles<Role extends string, Names> = { [key in Role]: string } & {
  [key in Exclude<keyof Names, Role>]: never;
};

export const sliceKeysOf = (refName: string, suffix = "") => {
  const names = sliceNames(refName, suffix);
  return names satisfies {
    state: ExactRoles<SliceStateKey, typeof names.state>;
    action: ExactRoles<SliceActionKey, typeof names.action>;
  };
};
