---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The pi agent packages move from 1.3.0 to 1.5.2, so an install of the CLI no longer pulls undici 8.10.2 (four high advisories, among them a TLS certificate check dropped in `Agent`) and minimatch 10.2.6. They now resolve to undici 8.12.3 and minimatch 11.0.3.
