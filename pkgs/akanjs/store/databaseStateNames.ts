import { capitalize } from "akanjs/common";

/**
 * The state keys every model store holds, and which of the model's five classes each one is an instance of.
 *
 * Shared with the agent catalogue, which needs the class rather than the key: a value read out of the store is
 * masked by the model it belongs to, and `immerify` drops the constructor, so the live value cannot say what it is.
 * `modelForm` is the one that matters most — it is an `Input` holding whatever the user has typed, credentials
 * included, and it reaches the catalogue as a plain object.
 */
export const databaseStateNames = (refName: string) => {
  const className = capitalize(refName);
  return {
    model: refName,
    modelLoading: `${refName}Loading`,
    modelForm: `${refName}Form`,
    modelFormLoading: `${refName}FormLoading`,
    modelSubmit: `${refName}Submit`,
    modelViewAt: `${refName}ViewAt`,
    modelModal: `${refName}Modal`,
    modelOperation: `${refName}Operation`,
    defaultModel: `default${className}`,
  };
};

/** Which of the model's classes each generated state key holds, for the keys that hold one at all. */
export const databaseStateModelTypes = {
  model: "full",
  modelForm: "input",
  defaultModel: "full",
} as const satisfies { [key in keyof ReturnType<typeof databaseStateNames>]?: "full" | "input" | "light" | "insight" };
