---
"akanjs": patch
---

A query that names the default 30 s timeout now shares its request with one that names none, and two queries whose `retry` policies hold the same fields in a different order share theirs, both in a server render and in the browser.
