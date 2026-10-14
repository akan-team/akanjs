---
"akanjs": minor
---

An endpoint can hand an MCP client's model a picture: declare `query(ImageResult, { guards })` (from `akanjs/base`) and return `{ data, mimeType, caption? }`, where `data` is padded base64 without a `data:` prefix and `mimeType` is `image/png`, `image/jpeg`, `image/webp` or `image/gif`. `tools/call` answers the caption as a text block and the picture as an image block, one pair per picture for `[ImageResult]`, with no `outputSchema`, `structuredContent` or JSON text block to repeat the base64. A value that breaks the shape is not sent: the call answers the generic failure and the log names what an `ImageResult` needs. Over HTTP the endpoint returns the JSON object as before, an MCP App view's call gets that object too, and a page prompt or the in-page agent reads only its `mimeType` and `caption`. Like `Binary`, `field(ImageResult)` fails the class build. `McpToolResult.content` now types an image block beside the text block.
