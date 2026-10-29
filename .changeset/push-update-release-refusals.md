---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

When an Akan Cloud project refuses a request with a 400, the CLI now prints the `data` the refusal carries beside its Err key, so a refused desktop release says what it failed on, such as the tar entry. `akan push-update` exits 2 when that key is a `release.error.*` one, on the upload request or the commit, for a phone pack as for a desktop release: it is the project's verdict on the release, as a rejected one is. Any other refusal still exits 1.
