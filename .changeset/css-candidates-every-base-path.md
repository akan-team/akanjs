---
"@akanjs/devkit": patch
---

An app with `basePaths` keeps every base path's CSS class scan in the candidate cache, so a start or build no longer rescans the sources of all but one of them. An entry is dropped only once its source file is deleted.
