---
"akanjs": patch
---

A `router.push`, `router.replace` or `router.enterDeepLink` called on the client before the router is initialized now waits for it instead of throwing `Router is not initialized`. A page's mount effect runs before the root layout's, and the root layout is what initializes the router, so a page that navigated as it mounted — a window a push notification opened, say — threw. The calls run in order the moment `init()` does. `navigation()` taken in the meantime settles with the navigation they make, and `enterDeepLink` answers `true`, since the manifest that could refuse the link is not loaded yet. On the server nothing changes.
