---
"akanjs": minor
"@akanjs/devkit": patch
---

feat(native): an iOS dev build installs next to the App Store app instead of replacing it

`akan start-ios` installed its build under the app's own bundle id, so putting a dev build on an iPhone replaced the
App Store app on that phone (Android already installed its debug build as `<appId>.debug`). The native config takes
`ios.debugAppIdSuffix`, and akanjs sets it to `.debug` for every app as it does for Android: a debug build's
CFBundleIdentifier, application-identifier, signing profile, install and launch all use `<appId>.debug`, and a release
build keeps the id it had. Outside main the server's apple-app-site-association lists `<team>.<appId>.debug` next to
the release id, as assetlinks.json does for Android.

A dev build on an iPhone now signs with a development profile for `<appId>.debug`: register that App ID (with the
capabilities the app uses, such as Push Notifications) and get its profile once, for example by building an Xcode
project with that bundle id for the phone. The simulator needs nothing. A push server that reaches dev builds sends
with the suffixed id as its APNs topic.
