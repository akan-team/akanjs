---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

The pi agent packages move from 1.3.0 to 1.5.2, so an install of the CLI no longer pulls undici 8.10.2 (four high advisories, among them a TLS certificate check dropped in `Agent`) and minimatch 10.2.6. They now resolve to undici 8.12.3 and minimatch 11.0.3.

`akan code` keeps the defaults it had on 1.3.0, so the bump changes nothing it bills: prompt caches are warmed only while a turn streams (pi 1.5 also warms them for up to 30 minutes between turns), and Anthropic requests carry the whole conversation instead of a server-side message thread. Setting `compat.supportsMessageThreads` in `models.json` still turns threads on.
