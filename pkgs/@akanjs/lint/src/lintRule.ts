import { noImportClientFunctions } from "./rules/noImportClientFunctions";
import { noImportExternalLibrary } from "./rules/noImportExternalLibrary";
import { nonScalarPropsRestricted } from "./rules/nonScalarPropsRestricted";
import { useClientByFile } from "./rules/useClientByFile";

export const akanjsLint = {
  rules: {
    noImportExternalLibrary,
    noImportClientFunctions,
    nonScalarPropsRestricted,
    useClientByFile,
  },
};
