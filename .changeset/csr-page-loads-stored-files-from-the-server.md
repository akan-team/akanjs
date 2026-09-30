---
"akanjs": patch
---

fix: a CSR page on another origin loads stored file URLs from the server

A file row keeps its URL relative to the server that wrote it (`/api/localFile/getBlob/...` with blob storage). A
native shell serves the page from `app://localhost` or `https://app.localhost`, so the relative URL resolved against
the app and the image never loaded. `resolveServerUrl` (`akanjs/client`) resolves an API-prefixed relative URL
against `serverHttpUri` when the page's origin is not the server's, and leaves every other URL alone. `CsrImage`
(so `Image` in a CSR bundle), agent attachments, and `libs/shared`'s editor images, videos, mention avatars, file
download links, file gallery and Excalidraw images use it; Excalidraw stores the URL relative again.
