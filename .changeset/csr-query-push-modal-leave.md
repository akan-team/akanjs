---
"akanjs": patch
---

In a native app (the CSR runtime), a push that changes only the query stays on its page, and a closing `Dialog.Modal` can play a leave animation.

`router.push` or a `Link` to the page already on screen, with only a different query or hash, used to add a copy of that page to the CSR stack: a record opened over a list with `?id=`, a calendar stepped to the next week, a filter changed. Back then showed the same screen again, once per push. Such a push now rewrites the entry it is on, as `router.replace` does, so one back leaves the page. A push to another path stacks as before, and a web page served by the server is unchanged.

What changes for an app: a screen that opens something with a query push and closes it with `router.back()` now leaves the page when it closes, because the push stacked nothing; `{ shallow: true }` makes no difference. Open and close it with `router.replace`, or give it a route of its own.

`Dialog.Modal` unmounted the moment it closed. It now marks its panel and backdrop `data-leaving` and stays drawn while an animation plays on the panel, so `data-leaving:animate-…` on the modal's `className` is its leave animation. It waits 600 ms at most, the backdrop fades and takes no taps meanwhile, and a sheet dragged shut leaves from where the finger let go. A modal with no such animation unmounts at once, as before.
