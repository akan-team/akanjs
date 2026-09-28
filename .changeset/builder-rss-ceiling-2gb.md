---
"@akanjs/devkit": patch
---

fix(dev): the incremental builder's default memory ceiling is 2GB, up from 1.2GB

- With no `AKAN_BUILDER_MAX_RSS_MB` set and no memory limit to take a share of, `akan start` now recycles its
  builder past 2GB instead of 1.2GB. apps/akan's builder peaks near 950MB holding the SSR registry's patcher through
  a route build, and arming CSR adds a second patcher, which left 1.2GB little room above ordinary work.
- A container limit or `AKAN_MEMORY_LIMIT` still sets the ceiling at 35% of it, and `AKAN_BUILDER_MAX_RSS_MB=0` still
  leaves the builder unbounded.
