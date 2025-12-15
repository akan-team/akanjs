/* eslint-disable */
import { ESLintUtils } from "@typescript-eslint/utils";

import { fileIsServerFile, getFilename } from "../util";

const allowedPropKeySet = new Set(["loader", "render", "of"]);

export const nonScalarPropsRestricted = ESLintUtils.RuleCreator(() => __filename)({
  name: "nonScalarPropsRestricted",
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that non-scalar props are not used.",
    },
    messages: {
      nonScalarPropsRestricted: "Error: Non-scalar props should not be used.",
    },
    // fixable: "code",
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = getFilename(context.filename);
    const isServerFile = fileIsServerFile(context.filename, context.sourceCode.text);
    if (!isServerFile || !["page.tsx", "layout.tsx"].includes(filename)) return {};
    return {
      JSXAttribute(node: any) {
        if (node.value?.expression) {
          const { expression, parent } = node.value;
          if (expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression") {
            if (!allowedPropKeySet.has(parent.name.name))
              context.report({
                node,
                messageId: "nonScalarPropsRestricted",
              });
          }
        }
      },
    };
  },
});
