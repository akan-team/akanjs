---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan create-package --name` takes `name` or `@scope/name`, each part lowercase letters, digits, `-`, `.` and `_` starting with a letter or digit, and refuses anything else before it touches a file: `"../x" is no package name; use name or @scope/name, each of lowercase letters, digits, -, . and _, starting with a letter or digit`. Before, `--name ../x` wrote `x/` beside `pkgs/` and added it to the root `tsconfig.json`. `akan create-ui`, `add-field` and `add-enum-field` refuse a `--module` that is not a module name with a `primitive-input-invalid` diagnostic in their report, as they already reported a missing one. Before, `create-ui --module ../x` wrote its component into the app root, and `add-field --module ../x` looked for the constant and dictionary outside the module folder. `plainNameProblem` returns the message `assertPlainName` throws, and `assertPackageName` sits beside it in `@akanjs/devkit/workflow/plainName`.
