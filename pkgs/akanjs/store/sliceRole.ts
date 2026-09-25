import type { SerializedArg } from "akanjs/signal";
import type { SliceStateKey } from "./state";

/** The generated slice actions, named by what they do rather than by the key any one slice publishes them under. */
export type SliceActionKey =
  | "initModel"
  | "refreshModel"
  | "selectModel"
  | "setPageOfModel"
  | "addPageOfModel"
  | "setLimitOfModel"
  | "setQueryArgsOfModel"
  | "setSortOfModel";

/**
 * What a generated key on `st.do` / `st.use` actually is.
 *
 * A slice publishes its keys with the model and the suffix spliced into the role name — `setPageOfUserInOrg` for the
 * `setPageOfModel` role of `user`'s `inOrg` slice — and the splicing is string replacement over capitalized names.
 * Recording the role while the key is being built is what saves a reader of the finished store from running that
 * replacement backwards, which does not have one answer: on a model named `page`, `setPageOfPage` is both the
 * paging action and a field setter.
 */
export interface SliceActionRole {
  role: SliceActionKey;
  refName: string;
  sliceName: string;
  /** The slice's own arguments, which the `initModel` and `setQueryArgsOfModel` roles take positionally. */
  args: SerializedArg[];
}

export interface SliceStateRole {
  role: SliceStateKey;
  refName: string;
  sliceName: string;
}
