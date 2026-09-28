---
"@akanjs/devkit": patch
---

fix(dev): the incremental builder's default memory ceiling is 2GB, up from 1.2GB

- With no `AKAN_BUILDER_MAX_RSS_MB` set and no memory limit to take a share of, `akan start` now recycles its
  builder past 2GB instead of 1.2GB. With the CSR patcher resident, apps/akan's builder reported up to 1.5GB at idle
  after routine work, so it could be recycled with no leak behind it.
- A container limit or `AKAN_MEMORY_LIMIT` still sets the ceiling at 35% of it, and `AKAN_BUILDER_MAX_RSS_MB=0` still
  leaves the builder unbounded.
