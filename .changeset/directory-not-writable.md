---
"akanjs": minor
---

A server that cannot write its SQLite directory, its solid SQLite directory or a local file storage root now stops at boot with `directoryNotWritable`, instead of booting and then failing with `attempt to write a readonly database` or an `EACCES` on the first upload. The message names the directory, the uid that owns it, the uid the server runs as, and the one-time fix: `chown -R <uid>:<gid> <dir>` as root on the volume that holds it, or the `volumePermissions` init container of the `infra/app` Helm chart. This is what a volume an image running as root wrote looks like to the generated image, which runs as uid 1000.

**Upgrading.** `BlobStorage` now has an `onInit` that makes this check. A subclass of your own that defines `onInit` calls `super.onInit()` first. A deployment whose data directory another user owns stops at boot with the message above: run the `chown` it names once, or let the chart's `volumePermissions` init container do it.
