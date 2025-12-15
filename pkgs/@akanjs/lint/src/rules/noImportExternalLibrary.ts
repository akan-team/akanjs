import { ESLintUtils } from "@typescript-eslint/utils";

import { fileIsPureImportFile, getAppName, isInternalImport } from "../util";

// TODO: 라이브러리간 의존성을 파악해서 상호 의존성을 만드는 걸 막아야함.
export const noImportExternalLibrary = ESLintUtils.RuleCreator(() => __filename)({
  name: "noImportExternalLibrary",
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that external libraries are not imported.",
    },
    messages: {
      noImportExternalLibrary: "Error: External libraries should not be imported.",
    },
    // fixable: "code",
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const isPureImportFile = fileIsPureImportFile(context.filename);
    if (!isPureImportFile) return {};
    const filePaths = context.filename.split("/");
    const appName = getAppName(filePaths);
    const appPath = appName ? `@${appName}` : null;
    return {
      ImportDeclaration(node) {
        const importPaths = node.source.value.split("/");
        if (!isInternalImport(importPaths, appPath))
          context.report({
            node,
            messageId: "noImportExternalLibrary",
            // fix(fixer) {
            //   return fixer.remove(node);
            // },
          });
      },
    };
  },
});
