---
"akanjs": patch
---

A store's generated writes and loads that take `onError` (`create<Model>InForm`, `update<Model>InForm`, `create<Model>`, `update<Model>`, `merge<Model>`, `remove<Model>`, `submit<Model>`, `edit<Model>`, `view<Model>`) now call it with the failed request's dictionary key before they reject, as a `Button`'s `onError` takes it. Before, they handed it to the fetch call, which never called it, and `merge<Model>` took no `onError` at all. The rejection and its error toast are unchanged. An abort calls nothing, and neither does a failure in the store's own write after the server took the request, since the request did not fail.

- **A `Button` keeps the error its `onError` reported.** When the `onClick` promise then rejected, the button went back to idle and dropped the error line under it, so an edit modal's submit or a remove showed only the toast. Now the error line stays until the next click.
