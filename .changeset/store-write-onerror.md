---
"akanjs": patch
---

A store's generated writes and loads that take `onError` (`create<Model>InForm`, `update<Model>InForm`, `create<Model>`, `update<Model>`, `remove<Model>`, `submit<Model>`, `edit<Model>`, `view<Model>`) now call it with the failed request's dictionary key before they reject, as a `Button`'s `onError` takes it. Before, they handed it to the fetch call, which never called it. The rejection and its error toast are unchanged, and an abort calls nothing.
