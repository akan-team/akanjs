# @akanjs/code

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/code/README.ko.md) | [Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/code) | [CLI](https://www.npmjs.com/package/@akanjs/cli)

The coding agent behind `akan code`: its engine, the tools it is given, and its terminal UI.

`@akanjs/cli` defines the `akan code` command, but the agent and the LLM provider SDKs it needs ship here, so a
workspace that never runs `akan code` never installs them.

## Install

Install it in the workspace at exactly the version of `@akanjs/cli`:

```bash
bun add -d @akanjs/code@<akan version>
```

`akan code` names that command when the package is missing or at another version, offers to run it in a terminal,
and otherwise exits with it.

## Usage

```ts
import { CodeAgent } from "@akanjs/code";
```

`@akanjs/code` is the SDK entry for embedding the agent; importing it loads the engine. `@akanjs/code/host` is the
light entry `akan code` loads first, which starts the engine only for the mode it runs in.

The shipped akan skills stay in `@akanjs/devkit` (`@akanjs/devkit/codeAgent`), so `akan agent install` works without
this package.
