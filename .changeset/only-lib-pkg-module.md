---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

Without a terminal, a command that deletes nothing now takes the workspace's only library, package or module when none is named, as it already did for the only app or lib, and names it on stderr: `No lib named, so this runs on 'util', the only one in this workspace: akan sync-library util`. This covers `sync-library`, `sync-package`, `build-package`, `verify-dist-package`, `create-view`, `create-unit`, `create-template` and `create-crud-page`. Before, each refused and asked for the target to be named. The remove commands still never take one they were not given. A terminal is still asked, even when there is only one choice.
