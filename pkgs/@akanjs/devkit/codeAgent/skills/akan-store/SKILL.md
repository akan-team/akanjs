---
name: akan-store
description: "Fill in a module store, or call module data and actions from UI — what store() already generates (CRUD, form setters, slice actions) and what belongs in your subclass."
---

# Akan store: what is already generated

`class CommentStore extends store(sig.comment, () => ({ /* extra state */ })) { /* extra actions */ }`
gives you the whole CRUD and form surface for free. **Redeclaring any of it is a typecheck error
("already exists"), and the fix is to delete your version and call the generated one** — never rename around
it, never cast, never reimplement.

For a model `comment` (`<Slice>` is a signal slice suffix, e.g. `InPublic`):

## Generated actions — `st.do.*`

- write: `createComment(input)`, `updateComment(id, input)`, `removeComment(id)`
- form: `newComment()`, `editComment(model)`, `writeOnComment(path, value)`, `set<Field>OnComment(value)`,
  `add<Field>OnComment(value)` / `sub<Field>OnComment(idx)` for arrays, `upload<Field>OnComment(fileList)`
  for file fields, `checkCommentSubmitable()`, `submitComment()`, `createCommentInForm()`,
  `updateCommentInForm()`
- single: `viewComment(model)`, `mergeComment(model, data)`, `setComment(...models)`, `resetComment()`
- per slice: `initComment<Slice>(...args)`, `refreshComment<Slice>()`, `selectComment<Slice>(model)`,
  `setPageOfComment<Slice>(page)`, `loadMoreOfComment<Slice>()`, `setLimitOfComment<Slice>(limit)`,
  `setQueryArgsOfComment<Slice>(...)`, `setSortOfComment<Slice>(sort)`

## Generated state — `st.use.*`

`comment`, `commentLoading`, `commentForm`, `commentFormLoading`, `commentFormUploading` (uploads in flight, per
`File` field — non-empty means do not submit), `commentSubmit`, `commentModal`,
`commentViewAt`, `commentOperation`; per slice `commentList<Slice>`, `commentListLoading<Slice>`,
`commentInitList<Slice>`, `commentSelection<Slice>`, `commentInsight<Slice>`, `pageOfComment<Slice>`,
`lastPageOfComment<Slice>`, `hasMoreOfComment<Slice>`, `limitOfComment<Slice>`, `sortOfComment<Slice>`.

## What your subclass is for

Only what the generated set does not cover: extra client state, a multi-step or cross-model workflow, and
calls to the non-CRUD endpoints you added in the signal. Each is an `async` method using `this.set(...)` /
`this.get()` / `this.pick(...)`.

To reach another store, cast `this`: `import type { RootStore } from "../st"`, then
`(this as unknown as RootStore).logout()` to call its action or `(this as unknown as RootStore).set({ … })` /
`.get()` to write or read its state. Every store is mixed into one root at runtime, so the cast only tells the
type what `this` already is. Keep it `import type` — `st.ts` imports every store, so a value import is a cycle.

A store that needs none of this stays empty. `store(sig.comment, () => ({}))` with an empty body is the
correct, complete result — an empty store is not an unfinished one.

## The rule the linter enforces

- **An action returns nothing.** Every method dispatches through `st.do.<action>()` and is typed `void`, so a
  returned value is unreachable. Write it into state with `this.set({ … })`.

## From UI

Read with `st.use.commentListInPublic()`, act with `st.do.createComment(input)` / `st.do.submitComment()`.
Do not wrap a generated action in a store method just to rename it.

**Pass a form setter by reference**: `onChange={st.do.setTypeOnComment}`, never
`onChange={(v) => st.do.setTypeOnComment(v)}`. The two run identically, but the arrow is an anonymous
closure, so the control emits no `data-akan-action` and publishes no agent tool for the field —
`no-unpublished-form-setter.grit` fails the build on it.

## Signal side

The scaffolded `slice(…, { guards: { root, get, cru } })` already exposes get / list / create / update /
remove. Add a query or mutation only for behaviour beyond CRUD, and give it its own `guards` array — a
custom endpoint never inherits the slice's.
