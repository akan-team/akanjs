---
"akanjs": minor
---

The in-page agent's `navigate` and `goBack` report the page they arrive on only once it has arrived, and `router.navigation()` waits for a `router.back()`.

- **`router.navigation()` waits for a back.** It used to settle as soon as `router.back()` was asked, before the page under slid back in and before the address moved. A caller reading the page or the address after it, as `navigate` and `goBack` do, could read the page it was leaving.
  - On a CSR stack it settles once the page under has slid back in and the address has moved.
  - On the web it settles once the address has moved; the page the RSC client draws there may still be on its way.
  - A `RouterInstance`'s `back` may now answer a promise, as `push` and `replace` may, and `router.navigation()` waits on it. `csrLocation.back()` answers one that settles at the back's pop, or at once when no entry of the document is under it. A shell that sends no pop stops holding it after a second.
- **`navigate` and `goBack` wait for the page's loads.** They waited for 120 ms of DOM quiet, so a section streamed in later, such as a board's list and the `st.tool`s it mounts, landed after the answer. The model then read a screen without those tools and said the act was not possible.
  - Every `Load.*` fallback, and a CSR page's `.loading()`, now draws a `template[data-akan-loading]` while it is pending. The mark draws nothing.
  - `ScreenSettle.loaded()` waits until no mark is left on a page in view, for 5 s at most, and the two built-ins call it before they answer.
  - A page parked out of view is not waited for. A web route's own `.loading()` boundary draws no mark.

Upgrading needs no step.
