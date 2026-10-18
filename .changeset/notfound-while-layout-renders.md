---
"akanjs": patch
---

`router.notFound()` (and `router.redirect()`) raised before the page sent its first byte now answers 404 (or the redirect) even while a layout is still rendering something async, such as a signed-in user's data. It used to answer 500 with "The render was aborted by the server without a reason.", because stopping the render reported every unfinished part as an error that replaced the not-found. A client that disconnects mid-render no longer logs those aborts as render failures either.
