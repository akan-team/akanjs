---
"akanjs": patch
---

fix(server): refuse the boot when two owners claim one `use` key or adaptor `refName`

Both registries were plain last-write-wins. A `use` key two libs both declared, or an adaptor `refName` two
classes both carried, silently kept the second: the first value was gone and the replaced adaptor's `onInit`
never ran. Neither left a trace, and an app whose `option.ts` shadowed a lib's key looked like it worked.

Registering either twice now fails `DiLifecycle` construction, naming the key and both claimants:

```
[DI:adaptor] 1 duplicate registration(s):
  • "imageStorage" is registered by service "article" and by service "gallery"
```

The check is per key, not per registration. One adaptor class reached from two services is one adaptor and
passes; a predefined role rebound with `applyAdaptor` is one class and passes. Only two *different* classes under
one `refName` clash — which is the case that used to defeat an override silently, because the collected class won
the map while the role kept pointing at the other one.

`AkanOption.getUses(env)` returns `[key, value][]` instead of a merged record, so a key declared twice inside one
option is caught the same way as one declared across two libs. Nothing outside the framework calls it.
