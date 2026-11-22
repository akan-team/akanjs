---
"akanjs": patch
---

An Android app's own native plugin can use ML Kit's document scanner next to push: the pinned Maven lock gains the closure of `com.google.android.gms:play-services-mlkit-document-scanner:16.0.0` with Firebase Messaging 25.1.3 and `androidx.core:core:1.10.0` (77 libraries, each checked against its SHA-256), which a plugin's `android.maven` naming the scanner selects in an app with push. The scanner without push, or with iap, has no closure yet, and its build still stops naming the root sets the lock holds.

An Android build also puts the jars an AAR carries in its `libs/` on the compile classpath and into the dex, as Gradle does. emoji2, which the scanner pulls in, keeps its flatbuffer classes there, and a release build's R8 stopped without them.
