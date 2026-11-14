---
"akanjs": patch
---

A `WebRouter` whose construction throws now clears the HTML result cache's sweep timer it had started, so a production server that retries its start no longer keeps one more timer per failed attempt. A dev router also removes its builder `message` listener on that path.
