---
"akanjs": patch
---

An API response whose body is still being written is no longer read to its end before the first byte leaves. The bytes already in hand are held, and from the first wait on the producer the body streams out compressed, so a large streamed export reaches the client at once and the server holds none of it. A body that is whole when the handler returns is compressed as before, with its length. A stream that passes 4 MiB without waiting is sent as it is. `application/wasm` is now compressible, so a WebAssembly module gets compressed on the fly, and a `.br`/`.gz` sidecar beside one in `public/` is served.
