---
"akanjs": patch
---

An MCP App view whose read is refused with 401 or 403 shows "This screen is not available to the signed-in account.". The view's code catches an error carrying that `statusCode` and the "You are not permitted to perform this action." the model reads. For such a read the server adds only the status to `_meta`: the error key and the guard's message stay on the server, and a read sent with no token still answers the 401 sign-in challenge. In the 3.1.0 release candidates the view said "The page failed to load."

A file an MCP App view's tool attaches with `ToolReturn.attach` reaches the host's model as image content only when it is a PNG, JPEG, WebP or GIF (`ImageResult.mimeTypes`), the types the in-page agent sends. Any other file, an SVG included, becomes a note naming those types. In the release candidates any `image/*` type went out as an image block, which the model's provider can refuse, failing the host's whole turn.
