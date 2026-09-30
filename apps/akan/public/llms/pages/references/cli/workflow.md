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

workflow

A named recipe for a change that always touches the same files in the same order.

plan file

The JSON `plan --out` writes: the steps, the files it expects to change, and the checks to run.

run artifact

What an apply, a validate or a repair leaves in `.akan/workflows/runs/<runId>.json`.

The run artifact's file name, such as `apply-20260921103000-a1b2c3`.

A narrow fix for one known kind of failure, picked by `<kind>`.

`sync`, `lint` or `typecheck` failed on the source; fix it or run a repair.

A workspace configuration, such as the Biome config, failed to load.

The command could not run at all, such as `command not found` (exit code 127).

Anything else, including a failed `build`; read the command output in the report.

plan and apply mode

apply mode

CLI only

Needs:

A new database-backed domain module, from the constant through the store and UI.

A reusable value module with no database ownership, such as a value object or shared scalar.

One conventional UI file for an existing module.

A field on the constant and the dictionary, with the Template form flagged for review.

A closed-value field: the enum class, its labels and options, and the field itself.

A service method and a mutation guarded by `None`; it only recommends a store action or UI control.

A service query and an `init` slice guarded by `None`; it only recommends the page load and Zone.

Create

Add to a module

`akan workflow <action> [workflow] [--format <markdown|json>] [--out <path>] [--dry-run <boolean>] [--app <name>] [--module <name>] [--field <name>] [--type <type>] [--values <a,b,c>] [--default <value>] [--scalar <name>] [--surface <name>] [--mutation <name>] [--slice <name>]`

List, explain, plan, apply, or validate a workflow, or print an earlier run's report. `plan` and `explain` never write source. Only `apply` does, and only from a plan file.

What to do. Left out, it is asked for at a prompt.

Needed by every action but `list`. What it names depends on the action; see Notes.

`markdown` is for a person; `json` is the report an MCP client receives.

`plan` only. Writes the plan JSON here; without it the plan is only printed and cannot be applied.

`apply` only. Reports the predicted apply without writing source; the run is still recorded.

Plan input: the target app or library. Every workflow requires it.

Plan input: the target domain, service or scalar module. All but `create-scalar` require it.

Plan input for `add-field` and `add-enum-field`: the field name.

Plan input for `add-field`: a field type or scalar name. Use `Int` or `Float`, never `Number`.

Plan input for `add-enum-field`, or `add-field` with `--type enum`: comma-separated enum values.

Plan input: the field default, converted by type. An enum default must be one of the values.

Plan input for `create-scalar`: the scalar name.

Plan input for `create-ui`: the UI file to create. `zone` and `util` plan but do not apply.

Plan input for `add-mutation`: the mutation or action name.

Plan input for `add-slice`: the slice or query name.

`workflow` is a name from `akan workflow list`.

`workflow` is the `--out` path, not a name; the run lands in `.akan/workflows/runs/<runId>.json`.

`workflow` is a plan path, a run artifact path, or a runId, and validation is recorded as a run too.

`workflow` is a runId whose report is printed again, whether apply, dry run, validate or repair.

`akan repair <kind> [--format <markdown|json>] [--app <name>] [--module <name>] [--target <name>]`

Run one narrow repair and print a structured report. Each kind is a known remedy for a known problem. `dictionary` and `module-shape` change nothing: they read `akan doctor --strict`, keep your module's findings, and name the command that fixes them.

Which repair to run. What each one does is in Notes.

Output format. `json` is what an MCP client receives.

Target app or library. Required by `generated`, `dictionary` and `module-shape`.

Target module. Required by `dictionary` and `module-shape`.

Target app, library or package. Required by `format` and `imports`.

Runs `akan sync <app>`.

Both run `akan lint <target>`; the kind only labels what the report is about.

Report only: finds missing dictionary labels and points at `akan add-field`.

Report only: finds a malformed module or a missing abstract and points at `akan create-module`.

afterwards

Every repair is recorded as a run and suggests `akan doctor --strict --format json` next.

over MCP

Apply mode serves `repair_generated`, `repair_imports`, `repair_module_shape`; others are CLI-only.

Workflow CLI

Adding one field to a module touches five files, and most of that work is mechanical. By hand, the decisions that matter — the name, the type, the default — get lost among dictionary labels and generated barrel files, and no two modules end up quite alike.

Words Used on This Page

Term

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

4. Repair

How Validate Sorts a Failure

Cause

Over MCP

Command

MCP tool · mode

Workflow Catalogue

What Validate Runs

Run by validate

Not run

Related Pages

Primitive Commands

The commands a workflow applies through. You can also run them directly.

Serves workflows and repairs to an agent as MCP tools.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

