# Workflow

- Source: /references/cli/workflow
- Mirror: /llms/pages/references/cli/workflow.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Workflow CLI (#workflow-cli)
- Plan, Apply, Validate (#plan-apply-loop)
- Workflow Catalogue (#workflow-catalogue)

## Content

Workflow

plan and apply mode

apply mode

CLI only

Needs:

Workflow CLI

Adding one field to a module touches five files, and most of that work is mechanical. By hand, the decisions that matter — the name, the type, the default — get lost among dictionary labels and generated barrel files, and no two modules end up quite alike.

A workflow gives that change a name: you plan it, read the plan, apply it, and validate the result. When validation fails, `akan repair` runs the one command that clears that failure.

Words Used on This Page

Term

- workflow: A named recipe for a change that always touches the same files in the same order.

- plan file: The JSON `plan --out` writes: the steps, the files it expects to change, and the checks to run.

- run artifact: What an apply, a validate or a repair leaves in `.akan/workflows/runs/<runId>.json`.

- runId: The run artifact's file name, such as `apply-20260921103000-a1b2c3`.

- akan repair: A narrow fix for one known kind of failure, picked by `<kind>`.

**Reach for a workflow before a direct edit.** When a workflow or a repair can make the change, use it instead of editing source by hand.

Plan, Apply, Validate

The steps form one chain, and each hands the next a file path rather than a name. That makes the plan a document you review before anything is written, and the run artifact a record of what happened.

Workflow chain

Plan

Apply

Validate

Repair

plan JSON

on failure

1. Plan

Checks your inputs and writes the plan JSON: the steps, the files it expects to change, and the checks to run. Source is neither read nor written.

2. Apply

Takes the plan file, not a workflow name, and writes the source changes. A plan with an error, such as a missing input, applies nothing.

3. Validate

Runs the checks the plan asked for — `sync`, `lint`, `typecheck` or `build` — and sorts each failure by cause.

4. Repair

The remedy for that cause. `generated` re-syncs, `format` and `imports` re-lint, and the two report-only kinds name the command that fixes the module.

How Validate Sorts a Failure

Cause

- source-change: `sync`, `lint` or `typecheck` failed on the source; fix it or run a repair.

- workspace-config: A workspace configuration, such as the Biome config, failed to load.

- environment: The command could not run at all, such as `command not found` (exit code 127).

- unknown: Anything else, including a failed `build`; read the command output in the report.

**Known failures are marked.** A config or environment failure seen on an earlier run is flagged as a known baseline blocker, unrelated to your change.

**Doctor findings ride along.** The report adds `akan doctor --strict` findings, split into what your change touched and what was already there. The CLI shows the second group only as counts per code.

Over MCP

`akan mcp` serves the same steps as tools. Plan mode reads and plans; apply mode can also write.

Command

MCP tool · mode

- akan workflow list: `list_workflows` · plan and apply mode

- akan workflow explain: `explain_workflow` · plan and apply mode

- akan workflow plan: `plan_workflow` · plan and apply mode

- akan workflow apply: `apply_workflow` · apply mode

- akan workflow validate: `run_validation` · apply mode

- akan repair generated: `repair_generated` · apply mode

- akan repair imports: `repair_imports` · apply mode

- akan repair module-shape: `repair_module_shape` · apply mode

- akan workflow report, akan repair format, akan repair dictionary: CLI only

**plan_workflow always stores its plan.** Without `out` it writes to `.akan/workflows/plans/` under a name built from the workflow and its inputs, such as `add-field-koyo-icecreamorder-topping.json`. It returns that `planPath` for `apply_workflow`.

Workflow Catalogue

Seven workflows ship with the CLI. `akan workflow list` prints each with when to use it, and `akan workflow explain <name>` adds its inputs, steps and validation commands.

With `--format json`, explain also carries the predicted changes and the completion criteria.

- create-module: A new database-backed domain module, from the constant through the store and UI. Needs: `--app` `--module`

- create-scalar: A reusable value module with no database ownership, such as a value object or shared scalar. Needs: `--app` `--scalar`

- create-ui: One conventional UI file for an existing module. Needs: `--app` `--module` `--surface`

- add-field: A field on the constant and the dictionary, with the Template form flagged for review. Needs: `--app` `--module` `--field` `--type`

- add-enum-field: A closed-value field: the enum class, its labels and options, and the field itself. Needs: `--app` `--module` `--field` `--values`

- add-mutation: A service method and a mutation guarded by `None`; it only recommends a store action or UI control. Needs: `--app` `--module` `--mutation`

- add-slice: A service query and an `init` slice guarded by `None`; it only recommends the page load and Zone. Needs: `--app` `--module` `--slice`

**create-ui plans five surfaces and applies three.** `--surface` accepts `view`, `unit`, `template`, `zone` and `util`; apply builds only the first three.

**Numbers are Int or Float.** A plan with `--type Number` carries an error, and a plan with an error applies nothing.

**Defaults follow the type.** `--default` is converted to match `--type`, and an enum default must be one of `--values`.

**Two add-field inputs are MCP-only.** Through `plan_workflow`, `surfaces: ["template"]` writes the field into a simple Template form and `includeInLight: true` adds it to the Light model.

What Validate Runs

Each workflow fixes the commands `validate` runs against its `--app`.

- Create

  - create-module

  - create-scalar

  - create-ui

- Add to a module

  - add-field

  - add-enum-field

  - add-mutation

  - add-slice

Run by validate

Not run

Related Pages

Primitive Commands

The commands a workflow applies through. You can also run them directly.

Serves workflows and repairs to an agent as MCP tools.

`akan workflow <action> [workflow] [--format <markdown|json>] [--out <path>] [--dry-run <boolean>] [--app <name>] [--module <name>] [--field <name>] [--type <type>] [--values <a,b,c>] [--default <value>] [--scalar <name>] [--surface <name>] [--mutation <name>] [--slice <name>]`

List, explain, plan, apply, or validate a workflow, or print an earlier run's report. `plan` and `explain` never write source. Only `apply` does, and only from a plan file.

- action (String, list | explain | plan | apply | validate | report, required): What to do. Left out, it is asked for at a prompt.

- workflow (String): Needed by every action but `list`. What it names depends on the action; see Notes.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person; `json` is the report an MCP client receives.

- --out (String, -w): `plan` only. Writes the plan JSON here; without it the plan is only printed and cannot be applied.

- --dry-run (Boolean, default false, -r): `apply` only. Reports the predicted apply without writing source; the run is still recorded.

- --app (String, -a): Plan input: the target app or library. Every workflow requires it.

- --module (String, -m): Plan input: the target domain, service or scalar module. All but `create-scalar` require it.

- --field (String, -f): Plan input for `add-field` and `add-enum-field`: the field name.

- --type (String, -t): Plan input for `add-field`: a field type or scalar name. Use `Int` or `Float`, never `Number`.

- --values (String, -l): Plan input for `add-enum-field`, or `add-field` with `--type enum`: comma-separated enum values.

- --default (String, -d): Plan input: the field default, converted by type. An enum default must be one of the values.

- --scalar (String, -c): Plan input for `create-scalar`: the scalar name.

- --surface (String, view | unit | template | zone | util · -u): Plan input for `create-ui`: the UI file to create. `zone` and `util` plan but do not apply.

- --mutation (String, -n): Plan input for `add-mutation`: the mutation or action name.

- --slice (String, -i): Plan input for `add-slice`: the slice or query name.

- explain · plan: `workflow` is a name from `akan workflow list`.

- apply: `workflow` is the `--out` path, not a name; the run lands in `.akan/workflows/runs/<runId>.json`.

- validate: `workflow` is a plan path, a run artifact path, or a runId, and validation is recorded as a run too.

- report: `workflow` is a runId whose report is printed again, whether apply, dry run, validate or repair.

`akan repair <kind> [--format <markdown|json>] [--app <name>] [--module <name>] [--target <name>]`

Run one narrow repair and print a structured report. Each kind is a known remedy for a known problem. `dictionary` and `module-shape` change nothing: they read `akan doctor --strict`, keep your module's findings, and name the command that fixes them.

- kind (String, generated | format | imports | dictionary | module-shape, required): Which repair to run. What each one does is in Notes.

- --format (String, default markdown, markdown | json · -o): Output format. `json` is what an MCP client receives.

- --app (String, -a): Target app or library. Required by `generated`, `dictionary` and `module-shape`.

- --module (String, -m): Target module. Required by `dictionary` and `module-shape`.

- --target (String, -t): Target app, library or package. Required by `format` and `imports`.

- generated: Runs `akan sync <app>`.

- format · imports: Both run `akan lint <target>`; the kind only labels what the report is about.

- dictionary: Report only: finds missing dictionary labels and points at `akan add-field`.

- module-shape: Report only: finds a malformed module or a missing abstract and points at `akan create-module`.

- afterwards: Every repair is recorded as a run and suggests `akan doctor --strict --format json` next.

- over MCP: Apply mode serves `repair_generated`, `repair_imports`, `repair_module_shape`; others are CLI-only.

## Code Examples

### workflow

```bash
akan workflow list
akan workflow explain add-field
akan workflow plan add-field --app koyo --module icecreamOrder --field topping --type String --out .akan/workflows/plans/topping.json
akan workflow apply .akan/workflows/plans/topping.json --dry-run true
akan workflow apply .akan/workflows/plans/topping.json
akan workflow validate .akan/workflows/runs/apply-20260921103000-a1b2c3.json
akan workflow report apply-20260921103000-a1b2c3
```

### repair

```bash
akan repair generated --app koyo
akan repair format --target koyo
akan repair imports --target koyo
akan repair module-shape --app koyo --module icecreamOrder
akan repair dictionary --app koyo --module icecreamOrder --format json
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

