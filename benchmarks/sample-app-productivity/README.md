# Sample App Productivity Benchmark

This benchmark measures how much effort it takes to build the same full-stack sample app with Akan.js and peer stacks.
It is not a latency benchmark. The core metrics are Cursor token usage, wall-clock time, repair iterations, generated
LOC, glue LOC, build success, lint success, convention adherence, and smoke-test pass rate.

## Target Scenario

The first scenario is `team-task-board`. Every stack receives the same requirements, the same prompt, the same repair
loop rules, and the same Playwright smoke test.

## Stacks

- `akanjs`: Akan.js using published `create-akan-workspace@2.2.12` and `akanjs@2.2.12`.
- `next-prisma`: Next.js App Router + Prisma + SQLite.
- `hono-drizzle`: Hono + Drizzle + React/Vite.
- `elysia-drizzle`: Elysia + Drizzle + React/Vite.
- `fastify-prisma`: Fastify + Prisma + React/Vite.

## Workflow

```bash
cd benchmarks/sample-app-productivity
bun install

# Prepare manual run instructions and every stack workspace for one benchmark batch.
bun harness/run.ts --all --scenario team-task-board --run-id smoke

# Open each workspace in Cursor and run the prompt manually.
cursor workspaces/smoke/akanjs
cursor workspaces/smoke/next-prisma

# After each agent run, verify and collect.
bun harness/verify.ts --run smoke --stack akanjs
bun harness/collect.ts --run smoke --stack akanjs --cursor-report workspaces/smoke/akanjs/cursor-report.json

# Generate the aggregate report.
bun report/generate.ts smoke
```

Use `--skip-commands` for a preparation dry-run that writes workspace docs and setup summaries without downloading or
installing stack starters:

```bash
bun harness/run.ts --all --scenario team-task-board --run-id prep-dry --skip-commands
```

## Manual Cursor Run Rules

Open each `workspaces/<runId>/<stack>` directory as a separate Cursor workspace. Use the exact `BENCHMARK_PROMPT.md`
in that directory. Stack-specific starter conventions are included in that prompt as appendices; do not add hints beyond
it. If build, lint, convention, or smoke verification fails, use `REPAIR_LOOP.md`: provide only the failure log and
failed acceptance items, with no implementation advice, for at most three attempts.

After the run, save the Cursor token report as `cursor-report.json` in the stack workspace. Use
`schemas/cursor-report.example.json` as the stable input shape if Cursor's exported report cannot be parsed directly.
Leave unavailable fields as `null`; do not estimate missing token or timing data.

For repair attempts, copy only the failed command or checker name, raw harness log, and failed acceptance criteria back into Cursor.
Do not include root-cause analysis, implementation hints, extra docs, or new requirements.

## Harness Contracts

- `harness/setup.ts` creates `workspaces/<runId>/<stack>` and writes `REQUIREMENTS.md`, `BENCHMARK_PROMPT.md`,
  `REPAIR_LOOP.md`, and `RUNBOOK.md`.
- `harness/verify.ts` runs the configured build command, optional lint command, optional convention check, configured app
  command, shared Playwright smoke test, and writes `results/<runId>/<stack>.verification.json`.
- `harness/collect.ts` requires a verification record, reads `cursor-report.json`, counts LOC from the baseline git diff,
  and writes `results/<runId>/<stack>__<mode>__<iteration>.json`.
- `report/generate.ts` aggregates collected run records into `report.md` and `report.chartdata.json`.

Reference shapes:

- `schemas/cursor-report.example.json`: manual Cursor token/timing metadata input.
- `schemas/run-record.example.json`: normalized output written by `harness/collect.ts`.

## Fairness Rules

- Same agent model for every stack in a batch.
- Same prompt and requirements, with only stack name, allowed package differences, and official starter convention
  appendices.
- Same independent workspace shape and same Cursor manual workflow.
- Same dependency lockfile for repeated runs in a batch.
- Failed runs are recorded and reported.
- Missing Cursor report fields are kept as `null`; they are not estimated.

## Output

Normalized run records are written to `results/<runId>/<stack>__<mode>__<iteration>.json`.
Reports are written to:

- `results/<runId>/report.md`
- `results/<runId>/report.chartdata.json`
