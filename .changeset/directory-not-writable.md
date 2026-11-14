---
"akanjs": patch
---

A server that cannot write its SQLite directory, its solid SQLite directory or a local file storage root now stops at boot with `directoryNotWritable`, instead of booting and then failing with `attempt to write a readonly database` or an `EACCES` on the first upload. The message names the directory, the uid that owns it, the uid the server runs as, and the one-time fix: `chown -R <uid>:<gid> <dir>` as root on the volume that holds it, or the `volumePermissions` init container of the `infra/app` Helm chart. This is what a volume an image running as root wrote looks like to the generated image, which runs as uid 1000.
