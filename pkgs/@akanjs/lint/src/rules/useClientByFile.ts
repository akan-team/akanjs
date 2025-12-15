/* eslint-disable */
import { ESLintUtils } from "@typescript-eslint/utils";

import { fileHasContent, fileHasUseClient, fileIsServerFile } from "../util";

export const useClientByFile = ESLintUtils.RuleCreator(() => __filename)({
  name: "useClientByFile",
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that `use client` is not used in `server` files.",
    },
    messages: {
      noUseClient: 'Error: "use client" should not be used at the top of a `server` file.',
      forceUseClient: 'Error: "use client" should be used at the top of a `client` file.',
    },
    // fixable: "code",
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const isServerFile = fileIsServerFile(context.filename, context.sourceCode.text);
    if (isServerFile === null) return {};
    if (isServerFile)
      return {
        Program(node) {
          if (!fileHasContent(context, node)) return;
          const { hasUseClient, firstLineIdx } = fileHasUseClient(context);
          if (hasUseClient)
            context.report({
              node: node.body[firstLineIdx],
              messageId: "noUseClient",
            });
        },
      };
    else
      return {
        Program(node) {
          if (!fileHasContent(context, node)) return;
          const { hasUseClient, firstLineIdx } = fileHasUseClient(context);
          if (!hasUseClient)
            context.report({
              node: node.body[firstLineIdx],
              messageId: "forceUseClient",
            });
        },
      };
  },
});
