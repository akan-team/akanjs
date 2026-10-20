# Migration

- Source: /cheatsheet/dev/migration
- Mirror: /llms/pages/cheatsheet/dev/migration.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Data Migrations (#overview)
- Create And Run (#command)
- Write One (#write)
- Rows And Filters (#table)
- Review, Apply, Roll Back (#review)
- Large Tables (#large)
- In A Container (#container)
- Writing Rules (#rules)

## Content

Migration

Data Migrations

A code change that renames, moves or splits a field leaves the documents already stored in the old shape. A migration is a file in `script/migration/` that reshapes them, and the same file runs on your machine and in a deployed container.

**It plans before it writes.** `plan` changes none of your data and reports what would change, and `apply` can refuse when the data moved since that report.

**Every run is recorded.** The app's own database keeps which migration ran, when, with which params and, given `--actor`, by whom, so each environment knows what it still owes.

**It can be rolled back.** Every write keeps the value it replaced. A rollback puts those back, deletes for good the rows the migration inserted or copied, and skips a row someone edited since.

- Scripts — Run a one-off job that needs no record.

- akan migrate Reference — Every action, option and exit code.

Create And Run

From the workspace root, create a migration named for what it does:

This writes `apps/koyo/script/migration/202610211000_orderToppings.ts`. The file name is the migration's id, and its UTC timestamp keeps migrations in the order they were written. Run it with `akan migrate`:

Action

What it does

- list — The default. Each migration as `pending`, `applied` or `partial`, with the params it takes.

- plan <id> — Runs `plan` and prints its summary, the first 100 items and a `planHash`.

- apply <id> — Plans again, writes, then runs `verify`.

- verify <id> — Runs `verify` alone.

- rollback <id> — Undoes the apply from its change log.

**Rerun one while you write it** by rolling it back, editing, and applying it again.

Write One

A migration's default export is `migration(title)` with three stages. This one moves each order's `topping` into a `toppings` list:

**`plan` only reports.** It returns the report a person reviews: `summary` to read, and optionally `items`, the decisions `apply` receives as its second argument.

**`verify` returns problems,** one string for each thing still wrong. It runs right after every apply, and an empty list means the data is as intended.

**Skip rows already fixed.** The `where` above leaves out orders without a `topping`, so a second run changes nothing.

Params

A choice that belongs to whoever runs the migration, not to the code, is a param. It takes a scalar such as `String` or `ID`, or an `enumOf` class, and its value is checked before `plan` runs:

The third argument of `.param()` takes:

- desc (String): What the value means, for whoever fills it in.

- enum (String[]): The values a `String` may take.

- default: The value when the param is left out.

- nullable (Boolean): Left out, the value is `null` rather than an error.

Rows And Filters

`table(refName)` reads and writes a model's rows as stored, so a field the model no longer declares is still reachable. `refName` is the camelCase model name:

Call

- find(where?, { after, limit }) — Rows in id order, removed ones too (as in `count` and `rewrite`) unless `{ withRemoved: false }`.

- get(id) · count(where?) — One row, or how many match.

- set(id, patch) · unset(id, paths) — Writes or removes dot paths in one row's `_doc`.

- rewrite(fn, { where }) — Walks matching rows 500 at a time (`batchSize`); `fn` returns a patch, or nothing to skip the row.

- insert(doc) · copy(id, patch) — A new row; `copy` starts from another row's `_doc`.

- remove(id) · restore(id) — A soft removal and its undo.

A filter maps dot paths into `_doc`, or a column such as `removedAt`, to a value or to `$ne`, `$in`, `$nin`, `$exists`, `$gt`, `$gte`, `$lt` or `$lte`. Every key must match.

**`$ne` leaves out missing and `null` values.** `{ status: { $ne: "done" } }` skips rows whose `status` is absent or `null`; find those with `{ status: null }`.

**`updatedAt` stays as it was.** A migration reshapes data rather than editing it, so nothing sorted by `updatedAt` moves.

**Beside `table`, each stage gets** `params`, `createId()` for a new row's id, `logger`, `sql` for a raw read, and `get(srv.IcecreamOrderService)` for a service of the booted app, with `srv` imported from `../../server`.

Review, Apply, Roll Back

On data others rely on, put a review between plan and apply. `plan` prints a `planHash` with its report; hand it to `apply` with `--expect`, and the apply stops with `planChanged` if the plan it computes again no longer matches.

**The hash covers the params too,** so apply with the params you planned with.

**A problem from `verify` fails the command** with exit code 3 but leaves the migration applied. Roll it back and fix the file, or write a new migration once another environment has applied this one.

**A rollback skips rows edited since.** A row whose value changed after the migration wrote it is left as it is and listed in the result, so a later edit is never overwritten.

**`.rollback(fn)` replaces the default** when undoing needs a judgment, such as keeping a copied row others now point at. It walks `changes` with `for await`, newest first, and calls `changes.revert(change)` or `changes.skip(change, reason)`.

**One run at a time.** While one runs, a second from another terminal or replica is refused.

Large Tables

An apply runs in one transaction, so a failure leaves nothing half done. On SQLite that transaction holds the only write lock, and once it passes about five seconds the live server's writes start to fail. For a table that takes longer, commit as you go:

**Each `rewrite` batch commits on its own,** with the point it reached. A failed apply leaves the migration `partial`: apply again with the same params to resume there, planning it again first if you pass `--expect`, or roll back what it wrote.

**Write it so a second run changes nothing.** A resumed apply runs `apply` from the top again.

**The change log takes disk.** Every changed row keeps its old and new values, about 160 bytes plus the values themselves.

In A Container

The built image carries every migration, so nothing is copied into a container. There, `bun main.js ops migrate` takes the same actions and options as `akan migrate`, without the app name:

**`--json` prints one JSON line last,** with `ok` and, on failure, a `code` naming why. The exit code is 0 on success, 2 for a mistake in the command, 3 when verify finds problems and 1 otherwise, `alreadyApplied` included.

**`--actor` names who ran it** in the run's record.

**It boots a second server beside the one serving traffic,** with no port and no schedules, and stops when the action ends.

Writing Rules

A migration changes production data that a rollback may have to put back. Four habits keep that possible:

**New code meets old data first.** A deploy serves traffic before anyone applies the migration, so the new code must read both shapes until it is applied.

**Write through `table()`, not services or `sql`.** A service write runs the model's hooks, which may notify users, and neither reaches the change log, so a rollback cannot undo it.

**Call nothing outside the database.** A rollback can put rows back, but it cannot unsend an email or refund a payment.

**Throw a plain `Error`** with a message an operator can act on. The run's record keeps it.

**Delete a migration once every environment has applied it.** Each database keeps its record, and the change log can still roll it back without the file, but only with the default undo, so keep a file whose `.rollback(fn)` you may still need.

## Code Examples

### Terminal

```bash
akan create-migration orderToppings koyo
```

### Terminal

```bash
akan migrate koyo
akan migrate koyo plan 202610211000_orderToppings
akan migrate koyo apply 202610211000_orderToppings
```

### apps/koyo/script/migration/202610211000_orderToppings.ts

```ts
import { migration } from "akanjs/server";

const hasTopping = { topping: { $ne: null } };

export default migration("Move each order's topping into its toppings list")
  .plan(async ({ table }) => ({
    summary: { orders: await table("icecreamOrder").count(hasTopping) },
  }))
  .apply(async ({ table }) => {
    await table("icecreamOrder").rewrite(
      ({ _doc }) => ({ toppings: [_doc.topping], topping: undefined }),
      { where: hasTopping },
    );
  })
  .verify(async ({ table }) => {
    const left = await table("icecreamOrder").count(hasTopping);
    return left ? [`${left} orders still hold a topping`] : [];
  });
```

### apps/koyo/script/migration/202610221400_orderStore.ts

```ts
import { ID } from "akanjs/base";
import { migration } from "akanjs/server";

const noStore = { store: null };

export default migration("Give storeless orders the fallback store")
  .param("fallbackStore", ID, { desc: "The store those orders join" })
  .plan(async ({ table }) => {
    const orders = await table("icecreamOrder").find(noStore);
    const items = orders.map(({ id }) => id);
    return { summary: { orders: items.length }, items };
  })
  .apply(async ({ table, params }, { items }) => {
    const store = params.fallbackStore;
    for (const id of items) await table("icecreamOrder").set(id, { store });
  });
```

### Terminal

```bash
akan migrate koyo plan 202610221400_orderStore \
  --param fallbackStore=6716a2c0f1e2d3c4b5a69788
```

### Terminal

```bash
akan migrate koyo plan 202610211000_orderToppings
akan migrate koyo apply 202610211000_orderToppings --expect <planHash>
akan migrate koyo rollback 202610211000_orderToppings
```

### apps/koyo/script/migration/202610211000_orderToppings.ts

```ts
import { migration } from "akanjs/server";

const hasTopping = { topping: { $ne: null } };

export default migration("Move each order's topping into its toppings list")
  .config({ transaction: false })
  .apply(async ({ table }) => {
    await table("icecreamOrder").rewrite(
      ({ _doc }) => ({ toppings: [_doc.topping], topping: undefined }),
      { where: hasTopping },
    );
  });
```

### Terminal

```bash
docker exec myapp bun main.js ops migrate list
```

### Terminal

```bash
kubectl exec -n myapp-main deploy/app-deployment -c app -- \
  bun main.js ops migrate plan 202610211000_orderToppings --actor jane --json
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

