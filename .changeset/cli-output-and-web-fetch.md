---
"@akanjs/cli": patch
"akanjs": patch
---

`akan code`'s `web_fetch` reads an intranet page itself instead of handing its URL to DeepSeek. In the release candidates it judged a host by its name alone, so a dotted intranet name such as `jira.corp.example.com`, a `.test` name, `localhost.` with its trailing dot, `[::]`, and a loopback or private address written IPv4-mapped (`[::ffff:127.0.0.1]`) went to DeepSeek's Fetch API. It now resolves the name first and sends the URL to DeepSeek only when every address it resolves to is public; a name that does not resolve stays on the machine.

The CLI's warning that the workspace's `akanjs` is not the CLI's own version now goes to stderr instead of stdout, so a command's machine-readable output, such as `akan doctor --format json` or the stdio stream of `akan mcp`, stays parseable.

A gateway that writes no log file, as in a built image, where `AKAN_LOG_TO_FILE=0` is the default, now prints its children's stderr on its own stderr instead of dropping it, so the stack of a child that crashes there is no longer lost. With a log file, a child's stderr still goes only to the file unless `AKAN_CHILD_STDERR=1`.

`akan lint` now explains a stale recipe index in an `AGENTS.md`, and a recipe with no variant to pick, in English instead of Korean. It also names each such recipe once, where macOS and Windows listed it twice.

In the release candidates, `AKAN_BUILD_METAFILE=0` and `AKAN_BUILD_METAFILE=false` still wrote the bundler's metafiles. Now `0`, `false` and an empty value leave them off.

`akan test <lib> --write false` no longer syncs the library first. Like `akan typecheck`, it scans the library without rewriting its generated files.
