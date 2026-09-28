---
"@akanjs/devkit": patch
---

fix(dev): on Windows the resident dev registry patcher no longer hands every save to a whole build, since a build worker now hashes the same bundle config as the builder
