---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan create-scalar`, `remove-scalar`, `create-module`, `create-service`, `create-application`, `create-library`, `install-library` and `create-workspace --app` refuse a name that is not one plain path segment before they touch a file, such as `"../.." is no scalar name; use letters, digits, - and _, starting with a letter`. Before, the name went into the path unchecked: `akan remove-scalar ../.. <app>` deleted `apps/<app>` and exited 0, and the create commands wrote their files outside `lib/`, `apps/` or `libs/`. A scalar, module or service name is checked as a workflow's `module` input already was, an app or lib name as its `app` input; both checks now live in `@akanjs/devkit/workflow/plainName`, with `assertPlainName`.
