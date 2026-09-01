---
"akanjs": patch
---

fix: a masked field carrying a `text` role is a compile error, not a failed boot

**`field.secret`, `field.hidden` and `resolve()` no longer accept a `text` role in their options.** The role puts a
plaintext copy of the value in the search mirror, so pairing it with masking publishes exactly what the masking
hides — the class build has always refused it. But the refusal fired during module evaluation, which means the
first sign of it was a backend that would not boot: three failed boots and then every route answering 503, with
typecheck and lint silent the whole time, because the option type was the same one plain `field` takes.

Removing `text` from those three option types moves the refusal to the call site, where the fix is obvious and the
editor shows it. The option type is a union, so the exclusion is distributive — a plain `Omit` over it would
collapse to the keys its members share.

**The class-build throw stays as the backstop** and now names the way out ("Drop the text role, or make the field
plain") instead of only what is wrong. It is still the only check that can catch the cross-file case, where a
scalar's own field carries a role and a parent in another file masks it — the excess-property check cannot see
an option object built elsewhere either.
