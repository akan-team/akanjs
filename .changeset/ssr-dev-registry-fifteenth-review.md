---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): renders queued through an RSC worker crash loop fail instead of hanging; a reload still importing is never overtaken by a recycle; a route's ok clears only its own route; a restart that applied its config but failed to come up clears once the builder returns; dense import cycles are walked once per file
