---
"akanjs": patch
---

A page the RSC navigation cache kept is no longer replayed for another account. The cache remembers the auth cookies its pages were rendered with, and a navigation that finds different ones — after `setAuth`, `resetAuth`, or a sign-in or sign-out in another tab — drops every kept page and asks the server again. Signing in no longer lands on the signed-out render of a page visited earlier, and going back after a sign-out no longer shows the previous account's page. With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, the first page after the change is rendered whole rather than patched into layouts drawn for the previous account. The page on screen stays as it is until the next navigation or `router.refresh()`.

A redirect raised while rendering a document — `router.redirect`, `getSelf({ unauthorize })` and the like — now carries `Cache-Control: no-store`, so no proxy or CDN in front of the app keeps it for the next visitor.
