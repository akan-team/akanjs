---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan register-binary` uploads the build's pack straight to the project's storage, as `akan push-update` does, so a proxy's request time limit can't cut off a large one. Both stop at once when the project says the upload was already used, instead of waiting out the retry window.

`akan push-update --pack <dir>` uploads a folder `akan pack-update` already wrote, instead of packing again: one pack built in CI can be checked, then uploaded as it is.
