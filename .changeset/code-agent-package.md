---
"@akanjs/cli": minor
"@akanjs/code": minor
"@akanjs/devkit": minor
---

The `akan code` agent moves into a new package, `@akanjs/code`, so a workspace that never runs `akan code` no longer installs its LLM provider SDKs (`@earendil-works/pi-*` and the Google, OpenAI, Anthropic and Bedrock clients they pull in). `@akanjs/cli` and `@akanjs/devkit` drop those dependencies.

- `akan code` stays a CLI command. It loads `@akanjs/code` from the workspace, then from the CLI's own install, and only at exactly the CLI's version. When it is missing or at another version, `akan code` names the command (`bun add -d @akanjs/code@<version>`, or `npm install -D …` in an npm workspace); in a terminal it offers to run it, and otherwise, or with `--json` or `--rpc`, it exits non-zero with that message.
- `@akanjs/code` is the SDK entry the `@akanjs/cli/code` subpath was; that subpath is removed. `@akanjs/code/host` is the light entry `akan code` loads first.
- The shipped akan skills and `akanCodePaths` stay in `@akanjs/devkit/codeAgent`, so `akan agent install` needs no `@akanjs/code`. The engine exports leave `@akanjs/devkit/codeAgent` for `@akanjs/code`.
- `akan update` pins `@akanjs/code` with the other Akan packages in a workspace that lists it.

Upgrading: a workspace that runs `akan code` adds `@akanjs/code` at its akan version. Code importing `@akanjs/cli/code` or the agent from `@akanjs/devkit/codeAgent` imports it from `@akanjs/code`.
