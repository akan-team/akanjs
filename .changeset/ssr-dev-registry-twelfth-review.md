---
"@akanjs/devkit": patch
---

fix(dev): a registry root handed back to a build worker waits for that worker instead of being handed over again, and a package counts as newly installed by its own folder, which another project's install cannot touch
