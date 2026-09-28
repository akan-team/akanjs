---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(cloud): on Windows, a `~/.akan/config.json` write waits for another command's read instead of failing

Windows refuses to rename over a file another process has open, and every `akan` command reads `config.json`
outside its lock. On a Windows VM, a writer racing two readers had 1374 of 1579 renames fail with `EPERM`. A token
refresh that lost that race fell back to the stored session. A session in its last hour is sent without
`Authorization`, so one of two commands started together saw the cloud as signed out. And when the lost write was
the one after the refresh, the rotated refresh token was never saved, so the next command had to sign in again.
`GlobalConfig` now retries the rename on `EPERM`, `EACCES` and `EBUSY` for up to about five seconds on Windows.
Under the same two readers, every write landed, the slowest after 40 tries (1.9s).
