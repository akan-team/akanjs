---
"akanjs": patch
---

An iOS app built with the iOS 26 SDK or later launches again on iOS 18.5. The shell called WebKit's Swift `Result` variant of `callAsyncJavaScript`, which the SDK binds to `/usr/lib/swift/libswiftWebKit.dylib` for the iOS 16 deployment target; the iOS 18.5 runtime has no such library, so dyld stopped the app at launch. The shell now calls the Objective-C method, and the app no longer loads `libswiftWebKit.dylib`.
