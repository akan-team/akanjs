---
"akanjs": minor
---

`Field.Switch` takes a `variant` prop, and its on position is now `primary`, as it is on `Switch`.

- **A `Field.Switch` without `variant` changes color:** the on position was `accent` and is now `primary`. Pass `variant="accent"` to keep the old look, or `"success"`.
- **Two `Data.Item` status tags change color:** `break` was an `accent` outline and is a neutral `muted-foreground` outline, so it no longer reads like `running`. `inProgress` was an `accent` fill and is an `info` fill.
