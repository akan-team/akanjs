---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A mutation sent while a page renders now fails unless the call opts in. `fetch.<mutation>()` called from a route's `.render()`, `.guard()`, `.head()` or `.loading()`, a layout's `.notFound()` or `.error()`, a component rendered inside them, or the page run behind a `.prompt()` throws `base.error.mutationInRender` as the call is made, before anything is sent. The throw is synchronous, so a `.catch()` on the call's promise does not swallow it. A CSR bundle refuses the call during a route's synchronous part. A socket `message` endpoint is refused the same way. Queries and subscriptions are not affected, and neither is a mutation sent outside a render, such as from a button, a store action, a service or a script.

To keep a write in the render, pass `{ duringRender: true }` as the call's option, the argument after the endpoint's own: `fetch.prepareSession(id, { duringRender: true })`, `fetch.updateItem(id, data, { duringRender: true })`. Do this only for a write that is harmless to repeat and safe for anyone who follows a link to trigger, such as a warm-up. An OAuth callback page that completes a connection also needs it, and must check that the `state` it receives was issued to the signed-in user. Move any other write to a user action. `duringRender` does not lift the `.app()` rule: an app's `load` still refuses every mutation with `base.error.mutationInApp`.

`akan quality` adds `akan.ssr.render-mutation`. It reports each `fetch.<mutation>()` or socket message a route's stages send, directly or through a function in the same file, without `{ duringRender: true }` in the option argument, and it tells a mutation from a query by reading the workspace's signals. An option it cannot read, such as a variable, counts as given. For a mutation sent from a mount-only effect, `akan.ssr.client-mount-load` now suggests a user action and no longer suggests moving the call into the route. The `pageRule`, `ssrRule` and `mcpRule` guidelines describe the new rule.
