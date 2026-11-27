---
"akanjs": minor
"@akanjs/devkit": patch
---

feat(native): a dev build reads "<appName> Dev" on the home screen

A dev build installs next to the store app as `<appId>.debug`, but both showed the same name, so a phone holding both
could not tell them apart. The native config takes `ios.debugAppNameSuffix` and `android.debugAppNameSuffix`, which a
debug build appends to its CFBundleDisplayName and Android label, and akanjs sets both to " Dev". A release build keeps
`appName`.
