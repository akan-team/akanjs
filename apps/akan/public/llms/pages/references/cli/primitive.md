# Primitive

- Source: /references/cli/primitive
- Mirror: /llms/pages/references/cli/primitive.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Primitive CLI (#primitive-cli)
- Primitive or Workflow (#primitive-or-workflow)

## Content

Primitive

Primitive CLI

Three commands that add one field or one UI file to a module that already exists. They write the mechanical part people get wrong by hand: a dictionary label left out, an import never added, a component in the wrong file.

They are the steps the `create-ui`, `add-field` and `add-enum-field` workflows apply. Run them directly when you already know what you want.

Words Used on This Page

Term

- primitive: A command that writes one change you already decided on straight to source, with no plan step.

- surface: The role of one module UI file — `view`, `unit` or `template` — picked with `--surface`.

- report: What each command prints when it ends: the changed files, diagnostics, and what to run next.

- workflow: The same change plus a plan to review first and checks to run after, compared at the end.

What Each Command Writes

Command

- Add a UI file

  - create-ui: Writes one View, Unit or Template file and nothing else.

- Add a field

  - add-field: Adds the field to the Input class and its label to the dictionary.

  - add-enum-field: Declares an enum class first, then adds a field typed as that class.

Written

Not touched

Rules All Three Share

**Missing options are not asked for.** Leave out `--app` or `--module` and the command prints an error in its report instead of a prompt.

**An error writes nothing.** An unknown app, a missing input or a bad value leaves every file as it was, and the report names the cause.

**You run sync and lint.** The command only writes source. Its report lists `akan sync <app>` and `akan lint <app>` as the next steps.

**`--format json` is for scripts and agents.** It prints the same report as one JSON object.

`akan create-ui --app <name> --module <name> [--surface <view|unit|template>] [--format <markdown|json>]`

Write one UI file into `lib/<module>/` of an existing module: a View, a Unit or a Template. It writes from the same template `akan create-module` uses, and touches no other file. It is the flag form of `akan create-view`, `create-unit` and `create-template`.

- --app (String, -a, required): Target app or library name.

- --module (String, -m, required): Target module name, such as `icecreamOrder`.

- --surface (String, default template, view | unit | template · -u): Which file to write; Zone and Util are not built by this command.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object.

- view: `<Module>.View.tsx` exporting `General`, the detail screen, as a server component.

- unit: `<Module>.Unit.tsx` exporting `Card`, one list or card item, as a server component.

- template: `<Module>.Template.tsx` exporting the `General` form, with "use client" on line 1.

- name field: The scaffold renders only the module's `name` field; swap in the fields you need.

- existing file: A file already at that path is overwritten with the scaffold, so commit first.

- afterwards: Run `akan sync <app>` and then `akan lint <app>`.

`akan add-field --app <name> --module <name> --field <name> --type <type> [--default <value>] [--format <markdown|json>]`

Add one field to a module's constant and dictionary. The field goes into `<Module>Input` in `<module>.constant.ts`, and its label and description into `.model<Module>` in `<module>.dictionary.ts`. For `Int` and `Float` it also adds the `akanjs/base` import.

- --app (String, -a, required): Target app or library name.

- --module (String, -m, required): Target module, whose constant and dictionary files must both exist already.

- --field (String, -f, required): Field name; a name already in the Input class is refused.

- --type (String, -t, required): Field type or scalar name; lowercase aliases such as `int` are normalized as listed in Notes.

- --default (String, -d): Optional default, converted to the type; a value the type rejects writes nothing.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object.

- number aliases: `int` and `integer` become `Int`; `float`, `double` and `decimal` become `Float`.

- other aliases: `string`, `boolean` and `date` are capitalized. Any other name is written as given.

- Int · Float: `number` and `numeric` are refused: use `Int` for whole numbers and `Float` for decimals.

- other imports: Only `Int` and `Float` get an import; add the one for `ID` or a scalar yourself.

- file fields: `Upload` is refused, since it belongs only in a file-upload body; relate the field to `File`.

- --default: `Int`/`Float` take a number, `Boolean` `true`/`false`, `Date` `now` or a date; others a string.

- --default now: Writes `() => dayjs()`, so each record gets its own time; a date is written as a thunk too.

- labels: The Korean label is filled in only for common words like `status`; otherwise it repeats the English.

- components: No component is edited, so add the field to the Template form yourself.

- afterwards: Run `akan sync <app>` and then `akan lint <app>`.

`akan add-enum-field --app <name> --module <name> --field <name> --values <a,b,c> [--default <value>] [--format <markdown|json>]`

Add a field that takes one value from a fixed set. First it declares the enum: an `enumOf` class named `<Module><Field>` in the constant, with the `enumOf` import added, and its options in the dictionary's `.enum` stage. Then it adds the field, typed as that class, exactly as `add-field` does.

- --app (String, -a, required): Target app or library name.

- --module (String, -m, required): Target module, whose constant and dictionary files must both exist already.

- --field (String, -f, required): Field name, which also names the enum: `status` on module `order` declares `OrderStatus`.

- --values (String, -l, required): Comma-separated enum values, such as `pending,serving,served`.

- --default (String, -d): Optional default, which must be one of `--values`.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object.

- no --type: The type is always the new enum class, which is why the command takes `--values` instead.

- add-field --type enum: Fails and writes nothing, so a new enum always goes through `add-enum-field`.

- existing enum: When the enum class already exists, run `add-field --type <Class>` instead.

- option labels: Each value gets a Title Case English label in both languages, so translate the Korean ones.

- afterwards: Run `akan sync <app>` and then `akan lint <app>`.

Primitive or Workflow

A primitive is one edit you already decided on. A workflow is the same edit, plus a plan you read first, the UI it can also touch, and a validation step after.

What you get

- Both

  - the source edit: The same field or UI file, written by the same code; a workflow calls these commands.

- Workflow only

  - a plan to review: You read what will change, then `akan workflow apply` writes it.

  - surfaces: ["template"]: Writes the field into a simple Template form, passed only through MCP `plan_workflow`.

  - includeInLight: true: Adds the field to the Light model too, and is also passed only through MCP.

  - akan workflow validate: Runs sync and lint, plus typecheck after a field change, and sorts failures by cause.

Included

Not included

When to Use Which

For a field you add while already working in the module. Two files, one command, no plan; you run sync and lint.

Workflow

For a change you want to review before it is written. It is the shape agents are told to use.

Related Pages

The plan, apply, validate and repair chain, and every workflow.

Module

Create the module itself with `akan create-module`.

## Code Examples

### create-ui

```bash
akan create-ui --app koyo --module icecreamOrder
akan create-ui --app koyo --module icecreamOrder --surface view
akan create-ui --app koyo --module icecreamOrder --surface unit --format json
```

### add-field

```bash
akan add-field --app koyo --module icecreamOrder --field topping --type String
akan add-field --app koyo --module icecreamOrder --field scoops --type Int --default 2
akan add-field --app koyo --module icecreamOrder --field servedAt --type Date --format json
```

### add-enum-field

```bash
akan add-enum-field --app koyo --module icecreamOrder --field status --values pending,serving,served
akan add-enum-field --app koyo --module icecreamOrder --field size --values small,large --default small
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

