---
"@akanjs/cli": patch
---

On Windows, `akan` now retries removing its build lock's removal marker for up to 3 s when an antivirus scanner or indexer briefly holds it, instead of leaving the marker behind and making other builds wait out the 120 s lease.
