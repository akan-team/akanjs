---
"@akanjs/devkit": patch
---

fix(devkit): stop a labelled tuple type from wiping every variant out of the build

Since arbitrary variants were kept whole, a candidate could open with `[`, which also made every
labelled tuple type in the tree look like a Tailwind arbitrary property —
`[key: string, make: () => unknown]` in `constant/getDefault.ts`,
`[setQueryArgs: (...) => QueryArgs, options?: FetchPolicy]` in `store/action.ts`. Tailwind compiled each
into a rule whose declaration was TypeScript, and the lightningcss pass in `optimize()` could not parse
it. Its error recovery does not stop at the offending rule: on `apps/minimal` it took 33KB of the
stylesheet with it, and what it took was **every variant** — no `hover:`, no `focus-visible:`, no
`disabled:`, no `sm:`/`md:`, no `dark:`, in a build that reported no error.

What that looked like: buttons and badges with no hover or press feedback, inputs with the browser's
own blue focus ring because `focus-visible:outline-none` was gone, a Switch whose knob never moved, a
Tooltip that never appeared, a Popconfirm that lost its offset, and modals stretched to full width with
their `sm:`/`md:` sizing missing. All of it from two type annotations.

Brackets in a candidate may no longer contain whitespace. Tailwind spells a space in an arbitrary value
`_`, so nothing legitimate is lost — `[&_td]:px-3` and `[&>*]:gap-2` still scan whole — while a tuple
type, which always has a space after its `:`, no longer reaches the compiler. The cache version is
bumped so extractions cached under the old pattern are re-read.
