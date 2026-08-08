---
"akanjs": minor
---

fix(document): give a Model's `insight<Query>` a real return type, and declare `db.<Model>Insight`

Declaring a filter query generates `count<Query>` and `insight<Query>` on both the Model and the Service. On the
Service the insight was typed; on the Model it came back as `unknown`, because `into()` passed `unknown` where
`QueryMethodPart` expects the insight type — so `await this.adminModel.insightByAccountId(id)` had no fields and
any use of the result needed a cast.

`into()` now threads the insight through from the constant model it already receives, typed as the document shape
because `insight()` accumulates into a plain record rather than a hydrated document.

The generated `lib/db.ts` also declares an insight document class per model and exports the type, mirroring what it
already did for `Input`:

```ts
class AdminInsight extends by(cnst.AdminInsight) {}
export type { AdminInsight };
```

`DatabaseRegistry.buildModel` takes that class instead of the constant insight, so `db.<Model>Insight` annotates
the result on both sides:

```ts
const insight: db.AdminInsight = await this.adminModel.insightByAccountId(accountId);
const count: number = await this.countByAccountId(accountId);
```

Run `akan sync <app-or-lib>` to regenerate `lib/db.ts`. A hand-written `DatabaseRegistry.buildModel` call — test
fixtures, mostly — now needs a `by()`-wrapped insight; wrap it after the `ConstantRegistry.buildModel` call, since
`by()` resolves the refName from the registry.
