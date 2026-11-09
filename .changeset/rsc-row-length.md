---
"akanjs": patch
---

A page that renders a string of 1024 characters or more, such as a post body or a long comment, now renders and hydrates whatever its lines say. React sends such a string, and every typed array or `ArrayBuffer`, as a length-prefixed Flight row whose raw bytes may hold newlines. The SSR sanitizer, the client navigation redirect guard and the partial-navigation patch check all split the stream on every newline, so they read lines inside the text as rows of their own. A line shaped like a debug row was dropped and a line shaped like a redirect row was rewritten, which broke the render. On a client navigation the guard could act on such a line as a redirect, and a partial navigation fell back to a full one.

All three now share one Flight row reader that follows React's row headers. It skips a length-prefixed row by its byte length across any chunk boundary, and it checks only real rows, which keep their sanitizing and redirect handling. Long text is no longer split and pattern-tested line by line. The server-rendered HTML also carries one inline script per Flight row instead of one per line, about 9% less inline-script HTML on a 400 KB payload.
