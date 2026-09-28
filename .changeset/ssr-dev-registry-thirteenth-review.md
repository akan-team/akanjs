---
"@akanjs/devkit": patch
---

fix(dev): a registry root handed to a build worker that was killed before it reported is handed over again, instead of waiting for a record that never comes
