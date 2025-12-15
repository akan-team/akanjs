/* eslint-disable */
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import { akanjsLint } from "./lintRule";
import type { Linter } from "eslint";

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export const eslintConfig = [
  {
    ignores: [
      "**/node_modules/**/*",
      "**/photoshop/**/*",
      "**/public/**/*",
      "**/ios/**/*",
      "**/android/**/*",
      "**/*.js",
      "**/*.jsx",
      "**/.next/**/*",
      "**/typechain-types/**/*",
      "**/script*.ts",
      "data/**/*",
      "dist/**/*",
      "releases/**/*",
      "apps/**/lib/__lib/**",
      "libs/**/lib/__lib/**",
      "apps/*/lib/cnst.ts",
      "apps/*/lib/dict.ts",
      "apps/*/lib/db.ts",
      "apps/*/lib/srv.ts",
      "apps/*/lib/st.ts",
      "apps/*/lib/sig.ts",
      "apps/*/lib/useClient.ts",
      "apps/*/lib/useServer.ts",
      "apps/*/lib/*/index.tsx",
      "apps/*/client.ts",
      "apps/*/server.ts",
      "libs/*/lib/cnst.ts",
      "libs/*/lib/dict.ts",
      "libs/*/lib/db.ts",
      "libs/*/lib/srv.ts",
      "libs/*/lib/st.ts",
      "libs/*/lib/sig.ts",
      "libs/*/lib/usePage.ts",
      "libs/*/lib/*/index.tsx",
      "libs/*/client.ts",
      "libs/*/server.ts",
      "libs/*/index.ts",
    ],
  },
  ...compat.extends(
    "next",
    "next/core-web-vitals",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked"
  ),
  {
    plugins: {
      "@akanjs/lint": akanjsLint,
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 6,
      sourceType: "module",

      parserOptions: {
        projectService: true,
      },
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },

      "import/resolver": {
        typescript: "./tsconfig.json",
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.js", "**/*.jsx"],

    rules: {
      "no-console": "error",
      "@akanjs/lint/useClientByFile": "error",
      "@akanjs/lint/noImportClientFunctions": "error",
      "@akanjs/lint/nonScalarPropsRestricted": "error",
      "@akanjs/lint/noImportExternalLibrary": "error",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "react/display-name": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-html-link-for-pages": "off",
      "jsx-a11y/alt-text": [0],
      "unused-imports/no-unused-imports": "warn",
      "no-unused-vars": "off",
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "off",
      "import/first": "warn",
      "import/newline-after-import": "warn",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "import/no-duplicates": "warn",
      "import/no-unresolved": "off",
      "import/named": "off",
      "import/namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-misused-spread": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
] as unknown as Linter.Config[];
