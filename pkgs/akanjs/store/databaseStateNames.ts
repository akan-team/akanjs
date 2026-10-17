import { capitalize } from "akanjs/common";

export const databaseStateNames = (refName: string) => {
  const className = capitalize(refName);
  return {
    model: refName,
    modelLoading: `${refName}Loading`,
    modelForm: `${refName}Form`,
    modelFormLoading: `${refName}FormLoading`,
    modelFormUploading: `${refName}FormUploading`,
    modelSubmit: `${refName}Submit`,
    modelViewAt: `${refName}ViewAt`,
    modelModal: `${refName}Modal`,
    modelDraft: `${refName}FormDraft`,
    modelOperation: `${refName}Operation`,
    defaultModel: `default${className}`,
  };
};

// The agent catalogue masks a read by this declared class: `immerify` drops the constructor from the live value.
export const databaseStateModelTypes = {
  model: "full",
  modelForm: "input",
  defaultModel: "full",
} as const satisfies { [key in keyof ReturnType<typeof databaseStateNames>]?: "full" | "input" | "light" | "insight" };
