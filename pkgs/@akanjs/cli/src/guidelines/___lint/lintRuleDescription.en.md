Core ESLint Extensions

Base Configurations:

- eslint:recommended - Standard ESLint recommended rules
- next & next/core-web-vitals - Next.js specific linting rules
- @typescript-eslint/recommended-type-checked - TypeScript recommended rules with type checking
- @typescript-eslint/strict-type-checked - Strict TypeScript type checking rules
- @typescript-eslint/stylistic-type-checked - TypeScript stylistic rules with type checking

Third-Party Plugins

1. eslint-plugin-unused-imports

- Automatically detects and warns about unused imports
- Helps keep code clean by removing unnecessary import statements

2. eslint-plugin-simple-import-sort

- Automatically sorts import statements in a consistent order
- Enforces clean import organization throughout the codebase

Custom Plugin: @akanjs/lint

1. useClientByFile

- Enforces proper "use client" directive usage in Next.js App Router
- Server files must NOT have "use client" directive
- Client files MUST have "use client" directive at the top

2. noImportClientFunctions

- Prevents server files from importing client-side functions
- Ensures proper separation between server and client code

3. nonScalarPropsRestricted

- Prevents non-scalar props (functions) in server components
- Specifically targets page.tsx and layout.tsx files
- Allows exceptions for specific props like "loader", "render", and "of"

4. noImportExternalLibrary

- Restricts external library imports in pure import/re-export files
- Only allows imports from the same app scope (@appName/...)
- Promotes clean architecture and prevents dependency leakage

Key Rule Configurations

Disabled Rules:

- no-console: "error" - Prevents console statements in production code
- Various TypeScript strict rules are disabled for flexibility
- React and Next.js specific rules are relaxed for development ease

Import Management:

- unused-imports/no-unused-imports: "warn" - Warns about unused imports
- simple-import-sort/imports: "warn" - Enforces import sorting
- import/first: "warn" - Ensures imports come first
- import/newline-after-import: "warn" - Enforces newline after imports

This configuration creates a robust linting setup that enforces Next.js App Router best practices, maintains clean code
organization, and ensures proper server/client code separation.
