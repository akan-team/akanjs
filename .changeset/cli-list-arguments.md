---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan test`, `akan preview` and `akan verify` take their list as separate words, and a command given too many
arguments says what it takes.

- `akan test <target> a.test.ts b.test.ts`, `akan preview <app> /board /board/new` and `akan verify shared web` now
  work; a comma-separated word still does. Each was refused as `too many arguments` before, with nothing saying the
  list went in one word. A command declares such an argument with `.arg(name, String, { multiple: true })`, last among
  its positionals, and its handler receives the list.
- The `too many arguments` refusal of every command is followed by what the command takes and where its help is:
  `` `akan quality` takes [action]: see `akan quality --help`. `` A `--format json` failure carries it in `error`.
- `akan test <target> <file>` refusing a file of another target now names the command that runs it:
  `` so run it as `akan test demo apps/demo/srvkit/b.test.ts` ``. The `files` help says the files are the target's own.
