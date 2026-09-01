---
"akanjs": patch
---

fix(service): let `onInit` and `onDestroy` be declared sync

`Adaptor` and `Service` both declared the pair as `onInit(): Promise<void>`, so a hook with nothing to await was a
type error even though every call site already awaited it:

```
Property 'onInit' in type 'SyncAdaptor' is not assignable to the same property in base type '… & Adaptor'.
```

Both hooks — and the interceptor's pair, which is the same shape — now return `Promise<void> | void`, the same
spelling `_preRemove` and the DI's own `onDestroy` probe already use. `override async onInit()` is unchanged.

```ts
export class Cursor extends adapt("cursor" as const, () => ({})) {
  override onInit() {
    this.watcher = watch(this.root);
  }
  override onDestroy() {
    this.watcher?.close();
  }
}
```

The default no-op bodies stopped being `async` as part of the same change: `serve()`'s implementation returns the
raw class, and TypeScript checks each overload's return type against it in one direction or the other, so widening
the interface while the base stayed `async` left neither direction assignable and broke `serve` itself with TS2394.
The one observable consequence is that an un-overridden `onInit()` returns `undefined` rather than a resolved
promise — `await` reads both the same, but `.then()` on it does not.

`_libsOnInit` / `_libsOnDestroy` now wrap each hook call. A sync hook that throws used to escape the `.map` before
`Promise.all` was ever reached, stranding the promises the async hooks beside it had already started; the throw
now arrives as a rejection with every sibling still attached.
