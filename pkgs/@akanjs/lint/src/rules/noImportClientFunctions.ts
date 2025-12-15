/* eslint-disable */
import { ESLintUtils } from "@typescript-eslint/utils";

import { fileHasClientFunction, fileIsServerFile } from "../util";

export const noImportClientFunctions = ESLintUtils.RuleCreator(() => __filename)({
  name: "noImportClientFunctions",
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that client functions are not imported.",
    },
    messages: {
      noImportClientFunctions: "Error: Client functions should not be imported.",
    },
    // fixable: "code",
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const isServerFile = fileIsServerFile(context.filename, context.sourceCode.text);
    if (!isServerFile) return {};
    return {
      ImportDeclaration(node) {
        const hasClientFunction = fileHasClientFunction(node);
        if (hasClientFunction)
          context.report({
            node,
            messageId: "noImportClientFunctions",
          });
      },
    };
  },
});
