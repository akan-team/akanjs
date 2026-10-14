---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan push-update` and `akan register-binary` upload only the files the pack's manifest lists. A pack folder keeps every earlier pack's files, so the upload used to grow with each pack until the project refused it as too large.

`akan push-update --pack <dir>` exits 2 when the pack needs a new store build, as `akan pack-update --against` does, instead of failing with 1.
