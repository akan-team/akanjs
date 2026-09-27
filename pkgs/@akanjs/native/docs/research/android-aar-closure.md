# FCM·Play Billing 전이 의존성 조사 (akanjs 준비 트랙 S2)

> 2026-09-26. Google Maven·Maven Central의 POM과 Gradle 모듈 메타데이터를 읽어 Gradle과 같은 규칙(높은 버전 우선)으로 풀고, 모든 아티팩트를 받아 열어 보고 d8로 dex 크기를 쟀다. 요약은 plugins.md "akanjs 준비 트랙 1단계 스파이크"에 있다. 잠금 초안: [android-aar-lock.json](android-aar-lock.json). 아래는 조사 원본(영문)이다.


Date: 2026-09-26. Read-only research; nothing in the akan-native repository was changed. All artifacts were fetched with plain HTTP GETs from Google Maven (`dl.google.com/dl/android/maven2`) and Maven Central (`repo1.maven.org/maven2`) into `scratchpad/s2/`.

Every number below comes from files that were downloaded and opened in this spike. Anything that is inference rather than measurement is marked **(inference)** or **(unverified)**.

## 1. Versions chosen

| Target | Version | Why this version | Published (HTTP Last-Modified of the POM) |
|---|---|---|---|
| `com.google.firebase:firebase-messaging` | **25.1.3** | Highest non-prerelease version in Google Maven `com/google/firebase/group-index.xml`. It is also the version that the latest `firebase-bom` (34.19.0) pins. | 2026-09-09 |
| `com.android.billingclient:billing` | **9.1.0** | Highest version in `com/android/billingclient/group-index.xml` (versions go up to 9.1.0; no prerelease suffixes listed). | 2026-06-18 |
| `com.android.billingclient:billing-ktx` (side note only) | 9.1.0 | Same release train. | n/a |

Neither target publishes a Gradle `.module` file (both return 404), so their own dependencies come from the POM. Many transitive AndroidX, Kotlin, kotlinx and Okio artifacts do publish `.module` files. The resolver used them whenever the POM carries the `do_not_remove: published-with-gradle-metadata` marker, which is the rule Gradle follows.

### How the closures were resolved

`scratchpad/s2/resolve.py` is a small Gradle-like resolver:
- Repositories are searched as `google()` first, then `mavenCentral()`.
- `.module` variant selection mimics an Android app's `releaseRuntimeClasspath`: `org.gradle.usage=java-runtime`, `category=library`, `androidJvm` preferred over `jvm`, `BuildTypeAttr=release`, and missing attributes count as compatible. It follows `available-at` redirects, for example `annotation` to `annotation-jvm`, `collection` to `collection-jvm`, `datastore-*` to `*-android`, `okio` to `okio-jvm`, and `kotlinx-coroutines-core` to `-jvm`.
- Dependencies come from `dependencies`, `dependencyConstraints` and `platform()` dependencies such as `kotlinx-coroutines-bom`.
- For POMs, only compile and runtime scopes count. Optional, test, provided and system dependencies are skipped. Parent POMs, properties and exclusions are honoured.
- Conflicts are resolved by highest version wins across all edges and constraints from reachable nodes, iterated until nothing changes. Evicted versions contribute no edges.
- Every downloaded file was checked against the repository's `.sha1` sidecar (all OK). Where a `.module` lists a `sha256` and `size`, those were checked too (all OK).

Results:
- FCM alone: **62 modules**.
- Billing alone: **46 modules**.
- Union of both: **72 modules**.
- `billing-ktx`: 47 modules.

Resolved graphs are in `s2/resolved-*.json`.

### Side variants that were also resolved

- **`billing-ktx` 9.1.0** adds exactly one module, `billing-ktx` itself: an aar of 71,724 bytes, with a 26,631-byte classes.jar and 23,716 bytes of dex (d8). It also raises `kotlin-stdlib` to 2.2.10. It declares `kotlinx-coroutines-core:1.6.0`, but plain billing already reaches 1.6.4 through AndroidX lifecycle, so it adds no new kotlinx artifact. The plain artifact remains the target.
- **Using the Firebase BOM** (`platform(firebase-bom:34.19.0)` + messaging) gives the same 62 modules, except `firebase-common` goes from 22.0.1 to **22.2.1** and `firebase-installations` from 19.1.1 to **19.1.2**. The size difference is negligible: +24 bytes of dex for common and +292 for installations. Both variants are in the lock draft (`fcm-bom`, `union-bom`).

## 2. Closures

`d8 dex bytes*` is the size of that artifact dexed **on its own** (`d8 --release --min-api 29 --lib android-36/android.jar`). These per-artifact numbers overcount the whole closure because string and type pools are shared. Use the whole-closure numbers in section 3 for totals.

"Consumer rules" counts non-comment lines in the aar's `proguard.txt` plus the jar's embedded `META-INF/proguard/*` and `META-INF/com.android.tools/**` rules.

### 2.1 FCM alone: `firebase-messaging:25.1.3` (62 modules)

| # | Coordinate | Pkg | File bytes | classes.jar bytes | d8 dex bytes* | res files | jni | Consumer rules (lines) | minSdk | Category | Manifest entries that matter |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | `androidx.activity:activity:1.0.0` | aar | 13,617 | 13,164 | 10,476 | 0 | - | - | 14 | AndroidX |  |
| 2 | `androidx.annotation:annotation:1.7.0` | jar | 55,232 | 55,232 | 24,328 | - | - | 14 (jar) | - | AndroidX (annotations-only) |  |
| 3 | `androidx.annotation:annotation-experimental:1.3.0` | aar | 36,019 | 6,282 | 5,280 | 1 | - | - | 14 | AndroidX |  |
| 4 | `androidx.arch.core:core-common:2.1.0` | jar | 11,257 | 11,257 | 8,728 | - | - | - | - | AndroidX |  |
| 5 | `androidx.arch.core:core-runtime:2.1.0` | aar | 6,059 | 6,294 | 4,384 | 0 | - | - | 14 | AndroidX |  |
| 6 | `androidx.collection:collection:1.1.0` | jar | 42,953 | 42,953 | 38,188 | - | - | - | - | AndroidX |  |
| 7 | `androidx.concurrent:concurrent-futures:1.1.0` | jar | 25,987 | 25,987 | 20,832 | - | - | - | - | AndroidX |  |
| 8 | `androidx.core:core:1.9.0` | aar | 1,115,684 | 1,152,261 | 867,868 | 120 | - | 15 (aar) | 14 | AndroidX | perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; defines perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; application@appComponentFactory=CoreComponentFactory |
| 9 | `androidx.customview:customview:1.0.0` | aar | 33,238 | 33,627 | 36,036 | 0 | - | - | 14 | AndroidX |  |
| 10 | `androidx.datastore:datastore:1.1.7` | aar | 26,511 | 27,809 | 25,600 | 1 | - | - | 19 | AndroidX |  |
| 11 | `androidx.datastore:datastore-core:1.1.7` | aar | 198,992 | 205,553 | 136,352 | 1 | 4 | - | 19 | AndroidX |  |
| 12 | `androidx.datastore:datastore-core-okio:1.1.7` | jar | 30,276 | 30,276 | 24,696 | - | - | - | - | AndroidX |  |
| 13 | `androidx.datastore:datastore-preferences:1.1.7` | aar | 16,725 | 17,254 | 16,240 | 1 | - | - | 19 | AndroidX |  |
| 14 | `androidx.datastore:datastore-preferences-core:1.1.7` | aar | 36,753 | 39,080 | 37,932 | 1 | - | 3 (aar) | 19 | AndroidX |  |
| 15 | `androidx.datastore:datastore-preferences-external-protobuf:1.1.7` | jar | 1,048,830 | 1,048,830 | 1,004,008 | - | - | - | - | AndroidX |  |
| 16 | `androidx.datastore:datastore-preferences-proto:1.1.7` | jar | 25,751 | 25,751 | 28,364 | - | - | - | - | AndroidX |  |
| 17 | `androidx.documentfile:documentfile:1.0.0` | aar | 11,221 | 11,278 | 11,740 | 0 | - | - | 14 | AndroidX |  |
| 18 | `androidx.fragment:fragment:1.1.0` | aar | 166,608 | 175,976 | 164,856 | 0 | - | - | 14 | AndroidX |  |
| 19 | `androidx.legacy:legacy-support-core-utils:1.0.0` | aar | 4,104 | 2,042 | 2,808 | 0 | - | - | 14 | AndroidX |  |
| 20 | `androidx.lifecycle:lifecycle-common:2.3.1` | jar | 23,505 | 23,505 | 17,876 | - | - | - | - | AndroidX |  |
| 21 | `androidx.lifecycle:lifecycle-livedata:2.0.0` | aar | 9,431 | 10,245 | 7,368 | 0 | - | - | 14 | AndroidX |  |
| 22 | `androidx.lifecycle:lifecycle-livedata-core:2.0.0` | aar | 8,372 | 8,645 | 7,620 | 0 | - | - | 14 | AndroidX |  |
| 23 | `androidx.lifecycle:lifecycle-runtime:2.3.1` | aar | 11,230 | 10,156 | 11,012 | 1 | - | 13 (aar) | 14 | AndroidX |  |
| 24 | `androidx.lifecycle:lifecycle-viewmodel:2.1.0` | aar | 8,647 | 9,126 | 6,956 | 0 | - | 6 (aar) | 14 | AndroidX |  |
| 25 | `androidx.loader:loader:1.0.0` | aar | 33,445 | 35,177 | 32,316 | 0 | - | - | 14 | AndroidX |  |
| 26 | `androidx.localbroadcastmanager:localbroadcastmanager:1.0.0` | aar | 6,808 | 6,875 | 6,824 | 0 | - | - | 14 | AndroidX |  |
| 27 | `androidx.print:print:1.0.0` | aar | 15,782 | 15,476 | 14,184 | 0 | - | - | 14 | AndroidX |  |
| 28 | `androidx.savedstate:savedstate:1.0.0` | aar | 9,768 | 9,744 | 8,352 | 0 | - | 3 (aar) | 14 | AndroidX |  |
| 29 | `androidx.versionedparcelable:versionedparcelable:1.1.1` | aar | 31,061 | 31,906 | 35,208 | 0 | - | 4 (aar) | 14 | AndroidX |  |
| 30 | `androidx.viewpager:viewpager:1.0.0` | aar | 53,513 | 55,298 | 52,464 | 0 | - | - | 14 | AndroidX |  |
| 31 | `com.google.android.datatransport:transport-api:3.1.0` | aar | 8,464 | 8,671 | 7,644 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) |  |
| 32 | `com.google.android.datatransport:transport-backend-cct:3.1.9` | aar | 53,551 | 60,329 | 51,212 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE, INTERNET; service TransportBackendDiscovery [meta: backend:com.google.android.datatransport.cct.CctBackendFactory] |
| 33 | `com.google.android.datatransport:transport-runtime:3.1.9` | aar | 179,644 | 211,088 | 157,436 | 0 | - | - | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE; service JobInfoSchedulerService; receiver AlarmManagerSchedulerBroadcastReceiver; service TransportBackendDiscovery |
| 34 | `com.google.android.gms:play-services-base:18.9.0` | aar | 614,902 | 509,096 | 334,736 | 124 | - | 3 (aar) | 23 | Play services | activity GoogleApiActivity |
| 35 | `com.google.android.gms:play-services-basement:18.9.0` | aar | 439,122 | 388,910 | 268,876 | 81 | - | 44 (aar) | 23 | Play services | app meta: com.google.android.gms.version |
| 36 | `com.google.android.gms:play-services-cloud-messaging:17.4.0` | aar | 93,057 | 66,046 | 47,160 | 0 | - | - | 23 | Play services | perm: ACCESS_NETWORK_STATE, INTERNET, WAKE_LOCK, com.google.android.c2dm.permission.RECEIVE |
| 37 | `com.google.android.gms:play-services-stats:17.0.2` | aar | 14,753 | 21,345 | 10,516 | 0 | - | - | 14 | Play services |  |
| 38 | `com.google.android.gms:play-services-tasks:18.4.0` | aar | 99,861 | 41,542 | 28,468 | 0 | - | - | 23 | Play services |  |
| 39 | `com.google.errorprone:error_prone_annotations:2.26.0` | jar | 18,988 | 18,988 | 7,496 | - | - | - | - | annotations-only (Google Error Prone) |  |
| 40 | `com.google.firebase:firebase-annotations:17.0.0` | jar | 3,517 | 3,517 | 1,620 | - | - | - | - | Firebase (annotations-only) |  |
| 41 | `com.google.firebase:firebase-common:22.0.1` | aar | 121,072 | 133,148 | 124,664 | 1 | - | 3 (aar) | 23 | Firebase | provider FirebaseInitProvider (${applicationId}.firebaseinitprovider); service ComponentDiscoveryService [meta: FirebaseCommonKtxRegistrar] |
| 42 | `com.google.firebase:firebase-components:19.0.0` | aar | 45,744 | 49,665 | 44,432 | 0 | - | 4 (aar) | 23 | Firebase |  |
| 43 | `com.google.firebase:firebase-datatransport:18.2.0` | aar | 5,825 | 3,586 | 4,676 | 0 | - | - | 14 | Firebase | service ComponentDiscoveryService [meta: TransportRegistrar] |
| 44 | `com.google.firebase:firebase-encoders:17.0.0` | jar | 17,847 | 17,847 | 7,864 | - | - | - | - | Firebase |  |
| 45 | `com.google.firebase:firebase-encoders-json:18.0.0` | aar | 9,223 | 28,221 | 13,216 | 0 | - | - | 14 | Firebase |  |
| 46 | `com.google.firebase:firebase-encoders-proto:16.0.0` | jar | 38,980 | 38,980 | 16,592 | - | - | - | - | Firebase |  |
| 47 | `com.google.firebase:firebase-iid-interop:17.1.0` | aar | 8,426 | 1,664 | 1,596 | 0 | - | - | 14 | Firebase |  |
| 48 | `com.google.firebase:firebase-installations:19.1.1` | aar | 56,436 | 62,522 | 58,332 | 0 | - | - | 23 | Firebase | perm: ACCESS_NETWORK_STATE, INTERNET; service ComponentDiscoveryService [meta: FirebaseInstallationsKtxRegistrar, FirebaseInstallationsRegistrar] |
| 49 | `com.google.firebase:firebase-installations-interop:17.3.0` | aar | 6,646 | 7,314 | 5,464 | 0 | - | - | 23 | Firebase |  |
| 50 | `com.google.firebase:firebase-measurement-connector:19.0.0` | aar | 10,625 | 3,488 | 3,072 | 0 | - | - | 16 | Firebase |  |
| 51 | `com.google.firebase:firebase-messaging:25.1.3` | aar | 156,493 | 164,994 | 155,424 | 1 | - | - | 23 | Firebase | perm: ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, WAKE_LOCK, com.google.android.c2dm.permission.RECEIVE; receiver FirebaseInstanceIdReceiver [meta: com.google.android.gms.cloudmessaging.FINISHED_AFTER_HANDLED]; service FirebaseMessagingService; service ComponentDiscoveryService [meta: FirebaseMessagingKtxRegistrar, FirebaseMessagingRegistrar] |
| 52 | `com.google.guava:listenablefuture:1.0` | jar | 3,149 | 3,149 | 932 | - | - | - | - | **Guava (single-interface artifact) (FLAG)** |  |
| 53 | `com.squareup.okio:okio:3.4.0` | jar | 360,090 | 360,090 | 319,664 | - | - | 1 (jar) | - | **Third-party: Square Okio (FLAG)** |  |
| 54 | `javax.inject:javax.inject:1` | jar | 2,497 | 2,497 | 1,820 | - | - | - | - | **Third-party: JSR-330 javax.inject (annotations + `Provider`) (FLAG)** |  |
| 55 | `org.jetbrains:annotations:23.0.0` | jar | 29,371 | 29,371 | 13,296 | - | - | - | - | annotations-only (JetBrains) |  |
| 56 | `org.jetbrains.kotlin:kotlin-android-extensions-runtime:1.9.22` | jar | 9,709 | 9,709 | 7,352 | - | - | - | - | **Kotlin add-on runtime, `kotlinx.*` packages (FLAG)** |  |
| 57 | `org.jetbrains.kotlin:kotlin-parcelize-runtime:1.9.22` | jar | 7,000 | 7,000 | 5,616 | - | - | - | - | **Kotlin add-on runtime, `kotlinx.*` packages (FLAG)** |  |
| 58 | `org.jetbrains.kotlin:kotlin-stdlib:2.0.21` | jar | 1,747,660 | 1,747,660 | 2,012,928 | - | - | - | - | Kotlin stdlib |  |
| 59 | `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.0` | jar | 963 | 963 | 0 | - | - | - | - | Kotlin stdlib |  |
| 60 | `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.0` | jar | 968 | 968 | 0 | - | - | - | - | Kotlin stdlib |  |
| 61 | `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0` | jar | 1,463,587 | 1,463,587 | 1,055,852 | - | - | 40 (jar) | - | **kotlinx.\* (FLAG)** |  |
| 62 | `org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0` | jar | 10,642 | 10,642 | 14,000 | - | - | - | - | **kotlinx.\* (FLAG)** |  |

### 2.2 Billing alone: `billing:9.1.0` (46 modules)

| # | Coordinate | Pkg | File bytes | classes.jar bytes | d8 dex bytes* | res files | jni | Consumer rules (lines) | minSdk | Category | Manifest entries that matter |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | `androidx.activity:activity:1.2.3` | aar | 67,451 | 61,078 | 43,556 | 0 | - | - | 14 | AndroidX |  |
| 2 | `androidx.annotation:annotation:1.8.1` | jar | 56,126 | 56,126 | 24,916 | - | - | 14 (jar) | - | AndroidX (annotations-only) |  |
| 3 | `androidx.annotation:annotation-experimental:1.4.1` | aar | 39,841 | 6,304 | 5,280 | 1 | - | - | 19 | AndroidX |  |
| 4 | `androidx.arch.core:core-common:2.2.0` | jar | 11,657 | 11,657 | 8,768 | - | - | - | - | AndroidX |  |
| 5 | `androidx.arch.core:core-runtime:2.2.0` | aar | 7,577 | 6,270 | 4,772 | 1 | - | - | 14 | AndroidX |  |
| 6 | `androidx.collection:collection:1.4.2` | jar | 775,789 | 775,789 | 723,728 | - | - | - | - | AndroidX |  |
| 7 | `androidx.concurrent:concurrent-futures:1.1.0` | jar | 25,987 | 25,987 | 20,832 | - | - | - | - | AndroidX |  |
| 8 | `androidx.core:core:1.15.0` | aar | 1,336,135 | 1,357,224 | 995,428 | 123 | - | 15 (aar) | 21 | AndroidX | perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; defines perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; application@appComponentFactory=CoreComponentFactory |
| 9 | `androidx.core:core-ktx:1.15.0` | aar | 175,963 | 189,998 | 153,112 | 1 | - | - | 21 | AndroidX |  |
| 10 | `androidx.customview:customview:1.0.0` | aar | 33,238 | 33,627 | 36,036 | 0 | - | - | 14 | AndroidX |  |
| 11 | `androidx.fragment:fragment:1.1.0` | aar | 166,608 | 175,976 | 164,856 | 0 | - | - | 14 | AndroidX |  |
| 12 | `androidx.interpolator:interpolator:1.0.0` | aar | 7,669 | 7,661 | 4,484 | 0 | - | - | 14 | AndroidX |  |
| 13 | `androidx.lifecycle:lifecycle-common:2.6.2` | jar | 52,314 | 52,314 | 41,812 | - | - | - | - | AndroidX |  |
| 14 | `androidx.lifecycle:lifecycle-livedata:2.6.2` | aar | 18,971 | 18,379 | 15,224 | 1 | - | - | 14 | AndroidX |  |
| 15 | `androidx.lifecycle:lifecycle-livedata-core:2.6.2` | aar | 11,345 | 9,612 | 8,376 | 1 | - | - | 14 | AndroidX |  |
| 16 | `androidx.lifecycle:lifecycle-runtime:2.6.2` | aar | 21,738 | 20,559 | 19,152 | 1 | - | 16 (aar) | 14 | AndroidX |  |
| 17 | `androidx.lifecycle:lifecycle-viewmodel:2.6.2` | aar | 39,793 | 41,698 | 31,248 | 1 | - | 6 (aar) | 14 | AndroidX |  |
| 18 | `androidx.lifecycle:lifecycle-viewmodel-savedstate:2.6.2` | aar | 39,786 | 40,372 | 36,124 | 1 | - | 6 (aar) | 14 | AndroidX |  |
| 19 | `androidx.loader:loader:1.0.0` | aar | 33,445 | 35,177 | 32,316 | 0 | - | - | 14 | AndroidX |  |
| 20 | `androidx.profileinstaller:profileinstaller:1.3.0` | aar | 47,529 | 47,432 | 41,652 | 1 | - | - | 14 | AndroidX | provider InitializationProvider (${applicationId}.androidx-startup) [meta: androidx.profileinstaller.ProfileInstallerInitializer]; receiver ProfileInstallReceiver |
| 21 | `androidx.savedstate:savedstate:1.2.1` | aar | 20,217 | 19,555 | 16,476 | 1 | - | 3 (aar) | 14 | AndroidX |  |
| 22 | `androidx.startup:startup-runtime:1.1.1` | aar | 19,371 | 6,788 | 7,040 | 1 | - | 5 (aar) | 14 | AndroidX | provider InitializationProvider (${applicationId}.androidx-startup) |
| 23 | `androidx.tracing:tracing:1.2.0` | aar | 6,060 | 4,175 | 4,696 | 1 | - | - | 14 | AndroidX |  |
| 24 | `androidx.versionedparcelable:versionedparcelable:1.1.1` | aar | 31,061 | 31,906 | 35,208 | 0 | - | 4 (aar) | 14 | AndroidX |  |
| 25 | `androidx.viewpager:viewpager:1.0.0` | aar | 53,513 | 55,298 | 52,464 | 0 | - | - | 14 | AndroidX |  |
| 26 | `com.android.billingclient:billing:9.1.0` | aar | 543,478 | 599,259 | 444,180 | 3 | - | 17 (aar) | 23 | Play Billing | perm: com.android.vending.BILLING; queries: com.android.vending.billing.InAppBillingService.BIND; com.google.android.apps.play.billingtestcompanion.BillingOverrideService.BIND; activity ProxyBillingActivity; activity ProxyBillingActivityV2; app meta: com.google.android.play.billingclient.version |
| 27 | `com.google.android.datatransport:transport-api:3.0.0` | aar | 4,898 | 12,130 | 6,116 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) |  |
| 28 | `com.google.android.datatransport:transport-backend-cct:3.1.8` | aar | 35,074 | 136,859 | 51,212 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE, INTERNET; service TransportBackendDiscovery [meta: backend:com.google.android.datatransport.cct.CctBackendFactory] |
| 29 | `com.google.android.datatransport:transport-runtime:3.1.8` | aar | 112,298 | 491,439 | 157,516 | 0 | - | - | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE; service JobInfoSchedulerService; receiver AlarmManagerSchedulerBroadcastReceiver; service TransportBackendDiscovery |
| 30 | `com.google.android.gms:play-services-base:18.5.0` | aar | 439,602 | 1,097,784 | 332,012 | 124 | - | 3 (aar) | 21 | Play services | activity GoogleApiActivity |
| 31 | `com.google.android.gms:play-services-basement:18.9.0` | aar | 439,122 | 388,910 | 268,876 | 81 | - | 44 (aar) | 23 | Play services | app meta: com.google.android.gms.version |
| 32 | `com.google.android.gms:play-services-location:19.0.0` | aar | 182,560 | 204,003 | 127,000 | 0 | - | - | 14 | Play services |  |
| 33 | `com.google.android.gms:play-services-places-placereport:17.0.0` | aar | 15,733 | 3,388 | 3,816 | 0 | - | - | 14 | Play services |  |
| 34 | `com.google.android.gms:play-services-tasks:18.2.0` | aar | 80,343 | 87,914 | 28,576 | 0 | - | - | 21 | Play services |  |
| 35 | `com.google.firebase:firebase-encoders:17.0.0` | jar | 17,847 | 17,847 | 7,864 | - | - | - | - | Firebase |  |
| 36 | `com.google.firebase:firebase-encoders-json:18.0.0` | aar | 9,223 | 28,221 | 13,216 | 0 | - | - | 14 | Firebase |  |
| 37 | `com.google.firebase:firebase-encoders-proto:16.0.0` | jar | 38,980 | 38,980 | 16,592 | - | - | - | - | Firebase |  |
| 38 | `com.google.guava:listenablefuture:1.0` | jar | 3,149 | 3,149 | 932 | - | - | - | - | **Guava (single-interface artifact) (FLAG)** |  |
| 39 | `javax.inject:javax.inject:1` | jar | 2,497 | 2,497 | 1,820 | - | - | - | - | **Third-party: JSR-330 javax.inject (annotations + `Provider`) (FLAG)** |  |
| 40 | `org.jetbrains:annotations:13.0` | jar | 17,536 | 17,536 | 7,628 | - | - | - | - | annotations-only (JetBrains) |  |
| 41 | `org.jetbrains.kotlin:kotlin-stdlib:1.8.22` | jar | 1,670,469 | 1,670,469 | 1,971,468 | - | - | - | - | Kotlin stdlib |  |
| 42 | `org.jetbrains.kotlin:kotlin-stdlib-common:1.8.22` | jar | 221,491 | 221,491 | 0 | - | - | - | - | Kotlin stdlib |  |
| 43 | `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.6.21` | jar | 23,898 | 23,898 | 38,996 | - | - | - | - | Kotlin stdlib |  |
| 44 | `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.6.21` | jar | 17,772 | 17,772 | 14,400 | - | - | - | - | Kotlin stdlib |  |
| 45 | `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4` | jar | 19,520 | 19,520 | 15,880 | - | - | 20 (jar) | - | **kotlinx.\* (FLAG)** |  |
| 46 | `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.4` | jar | 1,476,653 | 1,476,653 | 1,025,624 | - | - | 40 (jar) | - | **kotlinx.\* (FLAG)** |  |

Note: in this Billing-only graph, `kotlin-stdlib` resolves to **1.8.22**, while `kotlin-stdlib-jdk7` and `kotlin-stdlib-jdk8` stay at **1.6.21**. The 1.8.22 POM has no constraints that would align them. The result is **duplicate classes**: `d8` fails with `Type kotlin.collections.jdk8.CollectionsJDK8Kt is defined multiple times`. Gradle builds normally avoid this only because the Kotlin Gradle plugin adds alignment rules. See section 6.

### 2.3 Union: FCM + Billing (72 modules)

| # | Coordinate | Pkg | File bytes | classes.jar bytes | d8 dex bytes* | res files | jni | Consumer rules (lines) | minSdk | Category | Manifest entries that matter |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|
| 1 | `androidx.activity:activity:1.2.3` | aar | 67,451 | 61,078 | 43,556 | 0 | - | - | 14 | AndroidX |  |
| 2 | `androidx.annotation:annotation:1.8.1` | jar | 56,126 | 56,126 | 24,916 | - | - | 14 (jar) | - | AndroidX (annotations-only) |  |
| 3 | `androidx.annotation:annotation-experimental:1.4.1` | aar | 39,841 | 6,304 | 5,280 | 1 | - | - | 19 | AndroidX |  |
| 4 | `androidx.arch.core:core-common:2.2.0` | jar | 11,657 | 11,657 | 8,768 | - | - | - | - | AndroidX |  |
| 5 | `androidx.arch.core:core-runtime:2.2.0` | aar | 7,577 | 6,270 | 4,772 | 1 | - | - | 14 | AndroidX |  |
| 6 | `androidx.collection:collection:1.4.2` | jar | 775,789 | 775,789 | 723,728 | - | - | - | - | AndroidX |  |
| 7 | `androidx.concurrent:concurrent-futures:1.1.0` | jar | 25,987 | 25,987 | 20,832 | - | - | - | - | AndroidX |  |
| 8 | `androidx.core:core:1.15.0` | aar | 1,336,135 | 1,357,224 | 995,428 | 123 | - | 15 (aar) | 21 | AndroidX | perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; defines perm: ${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; application@appComponentFactory=CoreComponentFactory |
| 9 | `androidx.core:core-ktx:1.15.0` | aar | 175,963 | 189,998 | 153,112 | 1 | - | - | 21 | AndroidX |  |
| 10 | `androidx.customview:customview:1.0.0` | aar | 33,238 | 33,627 | 36,036 | 0 | - | - | 14 | AndroidX |  |
| 11 | `androidx.datastore:datastore:1.1.7` | aar | 26,511 | 27,809 | 25,600 | 1 | - | - | 19 | AndroidX |  |
| 12 | `androidx.datastore:datastore-core:1.1.7` | aar | 198,992 | 205,553 | 136,352 | 1 | 4 | - | 19 | AndroidX |  |
| 13 | `androidx.datastore:datastore-core-okio:1.1.7` | jar | 30,276 | 30,276 | 24,696 | - | - | - | - | AndroidX |  |
| 14 | `androidx.datastore:datastore-preferences:1.1.7` | aar | 16,725 | 17,254 | 16,240 | 1 | - | - | 19 | AndroidX |  |
| 15 | `androidx.datastore:datastore-preferences-core:1.1.7` | aar | 36,753 | 39,080 | 37,932 | 1 | - | 3 (aar) | 19 | AndroidX |  |
| 16 | `androidx.datastore:datastore-preferences-external-protobuf:1.1.7` | jar | 1,048,830 | 1,048,830 | 1,004,008 | - | - | - | - | AndroidX |  |
| 17 | `androidx.datastore:datastore-preferences-proto:1.1.7` | jar | 25,751 | 25,751 | 28,364 | - | - | - | - | AndroidX |  |
| 18 | `androidx.documentfile:documentfile:1.0.0` | aar | 11,221 | 11,278 | 11,740 | 0 | - | - | 14 | AndroidX |  |
| 19 | `androidx.fragment:fragment:1.1.0` | aar | 166,608 | 175,976 | 164,856 | 0 | - | - | 14 | AndroidX |  |
| 20 | `androidx.interpolator:interpolator:1.0.0` | aar | 7,669 | 7,661 | 4,484 | 0 | - | - | 14 | AndroidX |  |
| 21 | `androidx.legacy:legacy-support-core-utils:1.0.0` | aar | 4,104 | 2,042 | 2,808 | 0 | - | - | 14 | AndroidX |  |
| 22 | `androidx.lifecycle:lifecycle-common:2.6.2` | jar | 52,314 | 52,314 | 41,812 | - | - | - | - | AndroidX |  |
| 23 | `androidx.lifecycle:lifecycle-livedata:2.6.2` | aar | 18,971 | 18,379 | 15,224 | 1 | - | - | 14 | AndroidX |  |
| 24 | `androidx.lifecycle:lifecycle-livedata-core:2.6.2` | aar | 11,345 | 9,612 | 8,376 | 1 | - | - | 14 | AndroidX |  |
| 25 | `androidx.lifecycle:lifecycle-runtime:2.6.2` | aar | 21,738 | 20,559 | 19,152 | 1 | - | 16 (aar) | 14 | AndroidX |  |
| 26 | `androidx.lifecycle:lifecycle-viewmodel:2.6.2` | aar | 39,793 | 41,698 | 31,248 | 1 | - | 6 (aar) | 14 | AndroidX |  |
| 27 | `androidx.lifecycle:lifecycle-viewmodel-savedstate:2.6.2` | aar | 39,786 | 40,372 | 36,124 | 1 | - | 6 (aar) | 14 | AndroidX |  |
| 28 | `androidx.loader:loader:1.0.0` | aar | 33,445 | 35,177 | 32,316 | 0 | - | - | 14 | AndroidX |  |
| 29 | `androidx.localbroadcastmanager:localbroadcastmanager:1.0.0` | aar | 6,808 | 6,875 | 6,824 | 0 | - | - | 14 | AndroidX |  |
| 30 | `androidx.print:print:1.0.0` | aar | 15,782 | 15,476 | 14,184 | 0 | - | - | 14 | AndroidX |  |
| 31 | `androidx.profileinstaller:profileinstaller:1.3.0` | aar | 47,529 | 47,432 | 41,652 | 1 | - | - | 14 | AndroidX | provider InitializationProvider (${applicationId}.androidx-startup) [meta: androidx.profileinstaller.ProfileInstallerInitializer]; receiver ProfileInstallReceiver |
| 32 | `androidx.savedstate:savedstate:1.2.1` | aar | 20,217 | 19,555 | 16,476 | 1 | - | 3 (aar) | 14 | AndroidX |  |
| 33 | `androidx.startup:startup-runtime:1.1.1` | aar | 19,371 | 6,788 | 7,040 | 1 | - | 5 (aar) | 14 | AndroidX | provider InitializationProvider (${applicationId}.androidx-startup) |
| 34 | `androidx.tracing:tracing:1.2.0` | aar | 6,060 | 4,175 | 4,696 | 1 | - | - | 14 | AndroidX |  |
| 35 | `androidx.versionedparcelable:versionedparcelable:1.1.1` | aar | 31,061 | 31,906 | 35,208 | 0 | - | 4 (aar) | 14 | AndroidX |  |
| 36 | `androidx.viewpager:viewpager:1.0.0` | aar | 53,513 | 55,298 | 52,464 | 0 | - | - | 14 | AndroidX |  |
| 37 | `com.android.billingclient:billing:9.1.0` | aar | 543,478 | 599,259 | 444,180 | 3 | - | 17 (aar) | 23 | Play Billing | perm: com.android.vending.BILLING; queries: com.android.vending.billing.InAppBillingService.BIND; com.google.android.apps.play.billingtestcompanion.BillingOverrideService.BIND; activity ProxyBillingActivity; activity ProxyBillingActivityV2; app meta: com.google.android.play.billingclient.version |
| 38 | `com.google.android.datatransport:transport-api:3.1.0` | aar | 8,464 | 8,671 | 7,644 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) |  |
| 39 | `com.google.android.datatransport:transport-backend-cct:3.1.9` | aar | 53,551 | 60,329 | 51,212 | 0 | - | 2 (aar) | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE, INTERNET; service TransportBackendDiscovery [meta: backend:com.google.android.datatransport.cct.CctBackendFactory] |
| 40 | `com.google.android.datatransport:transport-runtime:3.1.9` | aar | 179,644 | 211,088 | 157,436 | 0 | - | - | 14 | Google datatransport (Firebase/Play telemetry infra) | perm: ACCESS_NETWORK_STATE; service JobInfoSchedulerService; receiver AlarmManagerSchedulerBroadcastReceiver; service TransportBackendDiscovery |
| 41 | `com.google.android.gms:play-services-base:18.9.0` | aar | 614,902 | 509,096 | 334,736 | 124 | - | 3 (aar) | 23 | Play services | activity GoogleApiActivity |
| 42 | `com.google.android.gms:play-services-basement:18.9.0` | aar | 439,122 | 388,910 | 268,876 | 81 | - | 44 (aar) | 23 | Play services | app meta: com.google.android.gms.version |
| 43 | `com.google.android.gms:play-services-cloud-messaging:17.4.0` | aar | 93,057 | 66,046 | 47,160 | 0 | - | - | 23 | Play services | perm: ACCESS_NETWORK_STATE, INTERNET, WAKE_LOCK, com.google.android.c2dm.permission.RECEIVE |
| 44 | `com.google.android.gms:play-services-location:19.0.0` | aar | 182,560 | 204,003 | 127,000 | 0 | - | - | 14 | Play services |  |
| 45 | `com.google.android.gms:play-services-places-placereport:17.0.0` | aar | 15,733 | 3,388 | 3,816 | 0 | - | - | 14 | Play services |  |
| 46 | `com.google.android.gms:play-services-stats:17.0.2` | aar | 14,753 | 21,345 | 10,516 | 0 | - | - | 14 | Play services |  |
| 47 | `com.google.android.gms:play-services-tasks:18.4.0` | aar | 99,861 | 41,542 | 28,468 | 0 | - | - | 23 | Play services |  |
| 48 | `com.google.errorprone:error_prone_annotations:2.26.0` | jar | 18,988 | 18,988 | 7,496 | - | - | - | - | annotations-only (Google Error Prone) |  |
| 49 | `com.google.firebase:firebase-annotations:17.0.0` | jar | 3,517 | 3,517 | 1,620 | - | - | - | - | Firebase (annotations-only) |  |
| 50 | `com.google.firebase:firebase-common:22.0.1` | aar | 121,072 | 133,148 | 124,664 | 1 | - | 3 (aar) | 23 | Firebase | provider FirebaseInitProvider (${applicationId}.firebaseinitprovider); service ComponentDiscoveryService [meta: FirebaseCommonKtxRegistrar] |
| 51 | `com.google.firebase:firebase-components:19.0.0` | aar | 45,744 | 49,665 | 44,432 | 0 | - | 4 (aar) | 23 | Firebase |  |
| 52 | `com.google.firebase:firebase-datatransport:18.2.0` | aar | 5,825 | 3,586 | 4,676 | 0 | - | - | 14 | Firebase | service ComponentDiscoveryService [meta: TransportRegistrar] |
| 53 | `com.google.firebase:firebase-encoders:17.0.0` | jar | 17,847 | 17,847 | 7,864 | - | - | - | - | Firebase |  |
| 54 | `com.google.firebase:firebase-encoders-json:18.0.0` | aar | 9,223 | 28,221 | 13,216 | 0 | - | - | 14 | Firebase |  |
| 55 | `com.google.firebase:firebase-encoders-proto:16.0.0` | jar | 38,980 | 38,980 | 16,592 | - | - | - | - | Firebase |  |
| 56 | `com.google.firebase:firebase-iid-interop:17.1.0` | aar | 8,426 | 1,664 | 1,596 | 0 | - | - | 14 | Firebase |  |
| 57 | `com.google.firebase:firebase-installations:19.1.1` | aar | 56,436 | 62,522 | 58,332 | 0 | - | - | 23 | Firebase | perm: ACCESS_NETWORK_STATE, INTERNET; service ComponentDiscoveryService [meta: FirebaseInstallationsKtxRegistrar, FirebaseInstallationsRegistrar] |
| 58 | `com.google.firebase:firebase-installations-interop:17.3.0` | aar | 6,646 | 7,314 | 5,464 | 0 | - | - | 23 | Firebase |  |
| 59 | `com.google.firebase:firebase-measurement-connector:19.0.0` | aar | 10,625 | 3,488 | 3,072 | 0 | - | - | 16 | Firebase |  |
| 60 | `com.google.firebase:firebase-messaging:25.1.3` | aar | 156,493 | 164,994 | 155,424 | 1 | - | - | 23 | Firebase | perm: ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, WAKE_LOCK, com.google.android.c2dm.permission.RECEIVE; receiver FirebaseInstanceIdReceiver [meta: com.google.android.gms.cloudmessaging.FINISHED_AFTER_HANDLED]; service FirebaseMessagingService; service ComponentDiscoveryService [meta: FirebaseMessagingKtxRegistrar, FirebaseMessagingRegistrar] |
| 61 | `com.google.guava:listenablefuture:1.0` | jar | 3,149 | 3,149 | 932 | - | - | - | - | **Guava (single-interface artifact) (FLAG)** |  |
| 62 | `com.squareup.okio:okio:3.4.0` | jar | 360,090 | 360,090 | 319,664 | - | - | 1 (jar) | - | **Third-party: Square Okio (FLAG)** |  |
| 63 | `javax.inject:javax.inject:1` | jar | 2,497 | 2,497 | 1,820 | - | - | - | - | **Third-party: JSR-330 javax.inject (annotations + `Provider`) (FLAG)** |  |
| 64 | `org.jetbrains:annotations:23.0.0` | jar | 29,371 | 29,371 | 13,296 | - | - | - | - | annotations-only (JetBrains) |  |
| 65 | `org.jetbrains.kotlin:kotlin-android-extensions-runtime:1.9.22` | jar | 9,709 | 9,709 | 7,352 | - | - | - | - | **Kotlin add-on runtime, `kotlinx.*` packages (FLAG)** |  |
| 66 | `org.jetbrains.kotlin:kotlin-parcelize-runtime:1.9.22` | jar | 7,000 | 7,000 | 5,616 | - | - | - | - | **Kotlin add-on runtime, `kotlinx.*` packages (FLAG)** |  |
| 67 | `org.jetbrains.kotlin:kotlin-stdlib:2.0.21` | jar | 1,747,660 | 1,747,660 | 2,012,928 | - | - | - | - | Kotlin stdlib |  |
| 68 | `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.0` | jar | 963 | 963 | 0 | - | - | - | - | Kotlin stdlib |  |
| 69 | `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.0` | jar | 968 | 968 | 0 | - | - | - | - | Kotlin stdlib |  |
| 70 | `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0` | jar | 19,247 | 19,247 | 15,472 | - | - | 20 (jar) | - | **kotlinx.\* (FLAG)** |  |
| 71 | `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0` | jar | 1,463,587 | 1,463,587 | 1,055,852 | - | - | 40 (jar) | - | **kotlinx.\* (FLAG)** |  |
| 72 | `org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0` | jar | 10,642 | 10,642 | 14,000 | - | - | - | - | **kotlinx.\* (FLAG)** |  |

When both modules are enabled, the union is not simply the two lists added together, because versions move up. Examples:
- `androidx.core` goes from 1.9.0 to 1.15.0.
- The lifecycle libraries go from 2.3.1 to 2.6.2.
- kotlinx-coroutines goes from 1.6.4 in the Billing-only graph to 1.9.0.
- `play-services-base` goes from 18.5.0 to 18.9.0.
- `transport-*` goes from 3.1.8 to 3.1.9.

The two targets share 40 modules in the union.

If akan-native pinned the union versions but enabled only FCM, FCM's reachable set would grow from 62 to **69** modules. The extra modules are `core-ktx`, `interpolator`, `lifecycle-viewmodel-savedstate`, `profileinstaller`, `startup-runtime`, `tracing` and `kotlinx-coroutines-android` (`s2/subsets-in-union.json`).

## 3. Totals

Download size = the sum of the aar and jar files, not counting metadata.

The "without Kotlin stdlib" columns drop the `kotlin-stdlib`, `-jdk7`, `-jdk8` and `-common` artifacts. akan-native already ships its own pinned `kotlin-stdlib` **2.4.20** (the `packages/cli/src/lib/toolchains.ts` pin). That version is higher than any version these libraries request (the highest is 2.0.21, or 2.2.10 with billing-ktx), so these columns are the real increment for akan-native.

Dex columns show `dex bytes / deflated-in-zip bytes / method_ids`, from **one d8 run over the whole closure**: `d8 --release --min-api 29 --lib platforms/android-36/android.jar`, with d8 from build-tools 37.0.0 (D8 9.2.4-dev) running on the system JDK 21. d8 succeeded every time and wrote a single `classes.dex` each time.

| Closure | Modules | Download bytes (all) | Download bytes (without Kotlin stdlib) | classes.jar total (all) | classes.jar total (without Kotlin stdlib) | **d8, without Kotlin stdlib** | d8, with resolved kotlin-stdlib | Rough R8 (see note) dex / deflated |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| FCM alone | 62 | 8,756,191 | 7,006,600 | 8,623,656 | 6,874,065 | 5,021,520 / 1,912,939 / 39,080 | 6,998,408 / 2,494,953 / 50,516 | 726,424 / 370,090 |
| Billing alone | 46 | 8,471,327 | 6,537,697 | 9,650,681 | 7,717,051 | 4,708,252 / 1,700,235 / 31,914 | 6,647,296 / 2,255,416 / 43,005 | 612,028 / 287,515 |
| FCM + Billing (union) | 72 | 10,920,767 | 9,171,176 | 10,823,680 | 9,074,089 | 6,653,780 / 2,427,983 / 48,231 | 8,626,280 / 3,011,046 / 59,615 | 1,077,740 / 528,138 |

- The "with resolved kotlin-stdlib" runs include `kotlin-stdlib` 2.0.21 (FCM, union) or 1.8.22 (Billing), and leave out the jdk7, jdk8 and common jars. jdk7 and jdk8 1.8.0 are 963- and 968-byte jars holding only `module-info` (no dex output). common 1.8.22 has no classes. jdk7 and jdk8 1.6.21 would duplicate stdlib 1.8.22 classes.
- **Method references:** union plus stdlib comes to 59,615 method ids in a single dex, close to the 65,536 limit. With akan-native's shell, plugin code and stdlib 2.4.20 added, a release build that includes both modules will almost certainly need a second dex file (`classes2.dex`) **(inference)**. At min-api 29, d8 and R8 split dex files automatically. akan-native's packaging must then add every `classes*.dex` to the APK. Dev builds already use `classes2.dex` for the stdlib.
- **Rough R8** (`s2/r8est.py`, not part of the requested d8 measurement): R8 `--release --min-api 29` with the consumer rules from the aars and jars. It adds `-keep` rules for every manifest component class, Firebase ComponentRegistrar and startup Initializer. It also adds `-keep public` rules for `FirebaseMessaging`, `RemoteMessage`, `FirebaseApp`, `FirebaseOptions` and `Task` (FCM), and for `com.android.billingclient.api.**` (Billing), plus `-ignorewarnings`. This only shows the order of magnitude after shrinking. Real app code and real keep rules will change it.

Largest dex contributors in the union (each dexed on its own):

| Artifact | d8 dex bytes | method ids |
|---|---:|---:|
| `org.jetbrains.kotlin:kotlin-stdlib:2.0.21` | 2,012,928 | 12,072 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0` | 1,055,852 | 5,351 |
| `androidx.datastore:datastore-preferences-external-protobuf:1.1.7` | 1,004,008 | 10,643 |
| `androidx.core:core:1.15.0` | 995,428 | 9,191 |
| `androidx.collection:collection:1.4.2` | 723,728 | 3,102 |
| `com.android.billingclient:billing:9.1.0` | 444,180 | 3,370 |
| `com.google.android.gms:play-services-base:18.9.0` | 334,736 | 3,165 |
| `com.squareup.okio:okio:3.4.0` | 319,664 | 1,806 |
| `com.google.android.gms:play-services-basement:18.9.0` | 268,876 | 2,392 |
| `androidx.fragment:fragment:1.1.0` | 164,856 | 1,416 |
| `com.google.android.datatransport:transport-runtime:3.1.9` | 157,436 | 1,202 |
| `com.google.firebase:firebase-messaging:25.1.3` | 155,424 | 1,228 |
| `androidx.core:core-ktx:1.15.0` | 153,112 | 1,175 |
| `androidx.datastore:datastore-core:1.1.7` | 136,352 | 687 |
| `com.google.android.gms:play-services-location:19.0.0` | 127,000 | 1,105 |

## 4. Artifacts by category (union, 72 modules; plus modules that appear only in the single-target graphs)

**kotlinx.\* (FLAG: kotlinx is banned by akan-native policy)**
- `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0`, published as the `kotlinx-coroutines-core-jvm-1.9.0.jar` file: FCM and union. Billing alone gets **1.6.4**.
  - FCM path: `firebase-common:22.0.1` (compile scope) → `kotlinx-coroutines-play-services:1.9.0` → `kotlinx-coroutines-core`. DataStore 1.1.7 also requests 1.7.3.
  - firebase-common's own bytecode uses coroutines directly (`FirebaseCommonKtxRegistrar`, `FirebaseKt.coroutineDispatcher`, `datastorage/JavaDataStorage`), so this dependency cannot be dropped.
- `org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0`: FCM and union, a direct compile dependency of `firebase-common`.
- `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0`: union only. Billing alone gets **1.6.4**.
  - Path: `billing` → `androidx.core:1.15.0` → `lifecycle-runtime:2.6.2` → `lifecycle-common:2.6.2` → `kotlinx-coroutines-android`. `lifecycle-viewmodel-savedstate:2.6.2` also depends on it.
  - Billing's own bytecode references **no** `kotlin/` or `kotlinx/` classes. kotlinx arrives purely through AndroidX lifecycle.
  - The jar carries `META-INF/services` entries for `MainDispatcherFactory` and `CoroutineExceptionHandler`.
- **Also in `kotlinx.*` packages, under group `org.jetbrains.kotlin` (FLAG):**
  - `kotlin-parcelize-runtime:1.9.22`, package `kotlinx.parcelize`.
  - `kotlin-android-extensions-runtime:1.9.22`, packages `kotlinx.android.extensions` and `kotlinx.android.parcel`. This is the deprecated synthetics runtime.
  - Both are pulled only by `datastore-core-android:1.1.7`, in its runtime variant and not its API variant. FCM and union only.

**Not Google, AndroidX or Kotlin stdlib (FLAG)**
- `com.squareup.okio:okio:3.4.0` (`okio-jvm-3.4.0.jar`, 360,090 bytes, 319,664 bytes of dex). Comes from DataStore (`datastore-core-okio`). FCM and union.
- `javax.inject:javax.inject:1` (JSR-330 annotations plus the `Provider` interface). Comes from `transport-runtime` and `firebase-annotations`. All three graphs.
- `com.google.guava:listenablefuture:1.0`: a Guava artifact containing a single interface. Comes from `androidx.concurrent:concurrent-futures` and `profileinstaller`. All three graphs.
- Annotations only:
  - `org.jetbrains:annotations` (23.0.0 in FCM and union, 13.0 in Billing alone).
  - `com.google.errorprone:error_prone_annotations:2.26.0` (FCM and union).
  - `androidx.annotation:annotation`, `firebase-annotations`.
- **Third-party code embedded in Google or AndroidX artifacts:**
  - `androidx.datastore:datastore-preferences-external-protobuf:1.1.7` is a repackaged protobuf-javalite (`androidx.datastore.preferences.protobuf`): a 1,048,830-byte jar with 523 classes and 1,004,008 bytes of dex.
  - The Play services and Billing aars contain obfuscated, repackaged third-party code (`com.google.android.gms.internal.*`). Their `third_party_licenses.json` lists include:
    - Billing: Protocol Buffers, Guava, Dagger, JSR-305/250/330, Checker Framework, Kotlin, Kotlin coroutines, kotlinx_serialization, kotlinx_atomicfu, apksig and others.
    - basement and base: Guava, Kotlin coroutines, kotlinx_serialization and others.
    - `transport-runtime`: Dagger.
  - These notices have to be collected into the app's open-source notices.

**Kotlin stdlib** (replaced by akan-native's 2.4.20; see section 5)
- `kotlin-stdlib`: 2.0.21 in FCM and union, 1.8.22 in Billing alone, 2.2.10 with billing-ktx.
- `kotlin-stdlib-jdk7` and `-jdk8`: 1.8.0 in FCM and union, where they contain only `META-INF/versions/9/module-info.class` and produce no dex. In Billing alone they are 1.6.21, which are real duplicates of stdlib classes.
- `kotlin-stdlib-common:1.8.22`: Billing alone only. The jar holds metadata and no classes. In billing-ktx, 2.2.10 is a variant with no files.

**Firebase** (12 modules): `firebase-messaging 25.1.3`, `firebase-common 22.0.1`, `firebase-components 19.0.0`, `firebase-installations 19.1.1`, `firebase-installations-interop 17.3.0`, `firebase-iid-interop 17.1.0`, `firebase-measurement-connector 19.0.0`, `firebase-datatransport 18.2.0`, `firebase-encoders 17.0.0`, `firebase-encoders-json 18.0.0`, `firebase-encoders-proto 16.0.0`, `firebase-annotations 17.0.0`. Billing alone also pulls the three `firebase-encoders*` artifacts, through datatransport.

**Google datatransport** (Firebase and Play telemetry through CCT/Clearcut): `transport-api`, `transport-backend-cct`, `transport-runtime`. These are 3.1.0 / 3.1.9 / 3.1.9 in FCM and union, and 3.0.0 / 3.1.8 / 3.1.8 in Billing alone.
- **Billing depends on these directly**, and its bytecode does use them (`CCTDestination`, `TransportRuntime`, `TransportFactory`). They are why a Billing-only app gains `INTERNET` and `ACCESS_NETWORK_STATE`.

**Play services** (7 modules in the union): `play-services-basement 18.9.0`, `play-services-base 18.9.0`, `play-services-tasks 18.4.0`, `play-services-cloud-messaging 17.4.0`, `play-services-stats 17.0.2`, `play-services-location 19.0.0`, `play-services-places-placereport 17.0.0`. The last two come from Billing.
- A static scan of `billing-9.1.0` bytecode and string constants finds **no reference** to `com.google.android.gms.location`, `gms.tasks` or any `play-services-base` class. The only Play-services class it references outside its own `gms.internal.play_billing` package is the annotation `gms.common.annotation.KeepForSdk`.

**Play Billing**: `com.android.billingclient:billing:9.1.0`, a 543,478-byte aar with 607 classes and 444,180 bytes of dex.

**AndroidX** (36 modules in the union; 30 in FCM alone, 25 in Billing alone):
- activity 1.2.3
- annotation 1.8.1, annotation-experimental 1.4.1
- arch core-common 2.2.0, core-runtime 2.2.0
- collection 1.4.2
- concurrent-futures 1.1.0
- core 1.15.0, core-ktx 1.15.0
- customview 1.0.0
- datastore (7 artifacts, 1.1.7)
- documentfile 1.0.0
- fragment 1.1.0
- interpolator 1.0.0
- legacy-support-core-utils 1.0.0
- lifecycle-common, -livedata, -livedata-core, -runtime, -viewmodel, -viewmodel-savedstate (all 2.6.2)
- loader 1.0.0
- localbroadcastmanager 1.0.0
- print 1.0.0
- profileinstaller 1.3.0
- savedstate 1.2.1
- startup-runtime 1.1.1
- tracing 1.2.0
- versionedparcelable 1.1.1
- viewpager 1.0.0

These are the AndroidX artifacts that the akanjs decision allows only as transitive dependencies of these two modules.

## 5. What a Gradle-less integration must do

### 5.1 Classpath and dex
- Put every `classes.jar` (from aars) and every plain jar on the kotlinc/javac compile classpath and the d8/R8 program input. None of the aars in these graphs contain `libs/*.jar`, so there are no inner jars to extract.
- **Replace the whole Kotlin stdlib family** with akan-native's pinned `kotlin-stdlib` 2.4.20: drop `kotlin-stdlib`, `-jdk7`, `-jdk8` and `-common` from the lock. Otherwise the Billing-only graph fails with duplicate classes, and the FCM graph ships a second, older stdlib.
- Library bytecode targets Kotlin up to 2.2.10 (billing-ktx) and 2.0.21 otherwise. A newer stdlib is backward compatible **(inference, standard Kotlin compatibility policy)**.
- Add Java resources to the APK when using d8: the `META-INF/services/*` files from `kotlinx-coroutines-android`. R8 can instead rewrite the `ServiceLoader` calls when those files are in its program input.
- Multi-release `META-INF/versions/9/module-info.class` entries (kotlin-stdlib, coroutines, jetbrains annotations, error_prone) caused no d8 errors.
- Multi-dex: section 3 shows the union alone nearly fills one dex.

### 5.2 Manifest merge (akan-native needs its own merger)
Merged items per graph, taken from the aar `AndroidManifest.xml` files:

**Permissions**
- `android.permission.INTERNET`: FCM, Billing and union. Comes from `transport-backend-cct`, `play-services-cloud-messaging` and `firebase-installations`.
- `android.permission.ACCESS_NETWORK_STATE`: all graphs. Comes from `transport-runtime`, `transport-backend-cct`, `cloud-messaging`, `installations` and `messaging`.
- `android.permission.WAKE_LOCK`: FCM. Comes from `cloud-messaging` and `messaging`.
- `android.permission.POST_NOTIFICATIONS`: FCM, from `messaging`. This is a runtime permission on API 33+, so the push plugin still has to ask for it.
- `com.google.android.c2dm.permission.RECEIVE`: FCM. Comes from `cloud-messaging` and `messaging`.
- `com.android.vending.BILLING`: Billing.
- `${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`: all graphs, from `androidx.core` (1.9.0 and 1.15.0). androidx.core both **defines** it (`protectionLevel=signature`) and uses it.

**Application attribute**
- `android:appComponentFactory="androidx.core.app.CoreComponentFactory"`, from `androidx.core`. akan-native's generated `<application>` must either carry it or deliberately leave it out. Gradle's merger would add it.

**FCM components**
- `provider com.google.firebase.provider.FirebaseInitProvider`: `authorities="${applicationId}.firebaseinitprovider"`, `initOrder=100`, `directBootAware=true`, `exported=false`.
- `service com.google.firebase.components.ComponentDiscoveryService` (`exported=false`, `directBootAware=true`) is declared by **four** aars. They must be merged into one element carrying all six registrar meta-data entries. Each entry has key `com.google.firebase.components:<class>` and value `com.google.firebase.components.ComponentRegistrar`. The six classes are:
  - `FirebaseCommonKtxRegistrar`
  - `datatransport.TransportRegistrar`
  - `installations.FirebaseInstallationsKtxRegistrar`
  - `installations.FirebaseInstallationsRegistrar`
  - `messaging.FirebaseMessagingKtxRegistrar`
  - `messaging.FirebaseMessagingRegistrar`

  Firebase finds its components by reading these entries at runtime. `firebase-components`' consumer rule `-keep class * implements ComponentRegistrar { void <init>(); }` keeps them in R8.
- `receiver com.google.firebase.iid.FirebaseInstanceIdReceiver`: `exported=true`, `permission=com.google.android.c2dm.permission.SEND`, intent-filter `com.google.android.c2dm.intent.RECEIVE`, meta-data `com.google.android.gms.cloudmessaging.FINISHED_AFTER_HANDLED=true`.
- `service com.google.firebase.messaging.FirebaseMessagingService`: `exported=false`, `directBootAware=true`, intent-filter `com.google.firebase.MESSAGING_EVENT` with priority -500. The akan-native push plugin would declare its own subclass with the same action at a higher priority **(inference, standard FCM usage)**.
- Datatransport components:
  - `service com.google.android.datatransport.runtime.backends.TransportBackendDiscovery` (`exported=false`) is declared twice and must be merged. `transport-backend-cct` adds meta-data `backend:com.google.android.datatransport.cct.CctBackendFactory=cct`.
  - `service ...scheduling.jobscheduling.JobInfoSchedulerService` with `permission=android.permission.BIND_JOB_SERVICE`.
  - `receiver ...scheduling.jobscheduling.AlarmManagerSchedulerBroadcastReceiver`.

  These also appear in Billing alone.
- `activity com.google.android.gms.common.api.GoogleApiActivity` (translucent theme, `exported=false`), from `play-services-base`. All graphs.
- Application meta-data `com.google.android.gms.version = @integer/google_play_services_version`, from `play-services-basement`. The value is a **resource reference**, so basement's `res/values/values.xml` has to be linked; that file defines `12451000`. This applies to all graphs.

**Billing components**
- `<queries>` with two `<intent>` actions:
  - `com.android.vending.billing.InAppBillingService.BIND`
  - `com.google.android.apps.play.billingtestcompanion.BillingOverrideService.BIND`

  Note: 9.1.0 declares **intent** queries, not a `<package android:name="com.android.vending">` query.
- `activity com.android.billingclient.api.ProxyBillingActivity` and `ProxyBillingActivityV2`: `exported=false`, `Theme.Translucent.NoTitleBar`, with `configChanges=keyboard|keyboardHidden|screenLayout|screenSize|orientation`.
- Application meta-data `com.google.android.play.billingclient.version=9.1.0`.

**androidx.startup and profileinstaller** (Billing alone and union, because Billing pulls `androidx.core` 1.15.0 and with it lifecycle 2.6.2)
- `provider androidx.startup.InitializationProvider`: `authorities="${applicationId}.androidx-startup"`, `exported=false`, `tools:node="merge"`. It carries meta-data `androidx.profileinstaller.ProfileInstallerInitializer=androidx.startup`.
- `receiver androidx.profileinstaller.ProfileInstallReceiver`: `exported=true`, `permission=android.permission.DUMP`, with 4 intent-filters. Without a baseline profile in the APK, these appear to do nothing useful. akan-native could leave them out, but that would be a deliberate difference from Gradle **(inference)**.

**Placeholders and tools attributes**
- `${applicationId}` appears in firebase-common, androidx.core and startup/profileinstaller. No other placeholders appear.
- The merger must also strip the `tools:` namespace (`tools:node="merge"`, `tools:targetApi="n"`).
- No aar declares `<uses-feature>`. Every aar declares `<uses-sdk>`, so no permissions are implied by an old target SDK.

**minSdk**
- The highest library `minSdkVersion` is **23**: firebase-common, -components, -installations, -installations-interop and -messaging; play-services-base and -basement 18.9.0; play-services-cloud-messaging 17.4.0; play-services-tasks 18.4.0; billing 9.1.0.
- The rest declare 14–21.
- All are at or below the planned minSdk 29.
- The highest `minCompileSdk` (aar-metadata) is **35** (`androidx.core` 1.15.0 and `core-ktx`), which is fine with android-36.
- All aars say `coreLibraryDesugaringEnabled=false` or leave it unset, so no desugared library is needed.

### 5.3 Resources and R classes
- Resource file counts: 333 in the FCM graph, 343 in Billing, 349 in the union.
  - The bulk comes from `play-services-base`: 124 files across 87 `values-*` locale directories, plus drawables and colors for the sign-in button.
  - `androidx.core`: 120–123 files (notification layouts, drawables, values).
  - `play-services-basement`: 81 locale `values*` files.
- Each aar's `res/` must be compiled with `aapt2 compile` and linked into the app. Gradle's non-namespaced model links library resources as overlays under the app package.
- **Resources read by name at runtime**, which must end up in the **app's own package**:
  - `firebase-common` → `FirebaseOptions.fromResource` → basement `StringResourceValueReader` (`getIdentifier` against the app package). It reads the strings `google_app_id`, `google_api_key`, `gcm_defaultSenderId`, `project_id`, `google_storage_bucket`, `firebase_database_url` and `ga_trackingId`.
  - `firebase-messaging` looks up `fcm_fallback_notification_channel_label` by name (`CommonNotificationBuilder` and `NotificationParams` use `getIdentifier`).
  - Billing ships `res/raw/com_android_billingclient_heterodyne_info`, `res/raw/com_android_billingclient_registration_info.binarypb` and `res/xml/com_android_billingclient_phenotype.xml`. Their names must survive linking and must not be removed by resource shrinking. `firebase-common` ships `res/raw/firebase_common_keep.xml` with `tools:keep` for the google-services strings.
- **google-services.json → `values.xml`**: akan-native has to do what the google-services Gradle plugin does and generate string resources:
  - `google_app_id` (from client `mobilesdk_app_id`)
  - `gcm_defaultSenderId` (from `project_number`)
  - `google_api_key` (from `api_key[0].current_key`)
  - `project_id`
  - `google_storage_bucket`
  - `firebase_database_url` (if present)
  - `default_web_client_id` (oauth client type 3, only needed for Google sign-in)
  - `google_crash_reporting_api_key` (legacy)

  The seven keys that `FirebaseOptions` reads (listed above) were found as string constants in firebase-common's bytecode. `default_web_client_id` and `google_crash_reporting_api_key` are not read by the FCM closure. The mapping from JSON fields to keys is the documented plugin behaviour **(unverified in this spike)**.
  - An alternative is to skip the resources: remove `FirebaseInitProvider` from the merged manifest and call `FirebaseApp.initializeApp(context, FirebaseOptions.Builder()...)` from the plugin **(inference)**.
  - Optional FCM meta-data keys found in messaging bytecode:
    - `com.google.firebase.messaging.default_notification_channel_id`
    - `...default_notification_icon`
    - `...default_notification_color`
    - `firebase_messaging_auto_init_enabled`
    - `firebase_messaging_notification_delegation_enabled`
    - `delivery_metrics_exported_to_big_query_enabled`
    - `firebase_data_collection_default_enabled` (in firebase-common)
- **R classes (`aapt2 link --extra-packages`)**: library bytecode reads R fields with `getstatic`, so an R class with final IDs must exist for each library package whose R class the code references. A scan of every class file for `<pkg>/R$<type>` found these:
  - FCM graph: `androidx.core`, `androidx.lifecycle.runtime`, `com.google.android.gms.base`, `com.google.android.gms.common`.
  - Billing alone and union: `androidx.core`, `androidx.lifecycle.runtime`, `androidx.lifecycle.viewmodel`, `androidx.savedstate`, `androidx.startup`, `com.google.android.gms.base`, `com.google.android.gms.common`.
  - The safe choice, which is what AGP does, is to generate an R class for **every** aar package with a non-empty `R.txt`: `androidx.activity`, `androidx.core`, `androidx.customview`, `androidx.fragment`, `androidx.legacy.coreutils`, `androidx.lifecycle.runtime`, `androidx.lifecycle.viewmodel`, `androidx.loader`, `androidx.savedstate`, `androidx.startup`, `androidx.viewpager`, `com.android.billingclient`, `com.google.android.gms.base`, `com.google.android.gms.common`, `com.google.firebase`, `com.google.firebase.datatransport`, `com.google.firebase.messaging`.
  - Then compile those R.java files into the dex.

### 5.4 ProGuard/R8 rules
- 208 non-comment consumer rule lines across the union: aar `proguard.txt` plus jar-embedded rules. They come from:
  - `androidx.annotation`, `core`, `datastore-preferences-core`, the lifecycle libraries, `savedstate`, `startup`, `versionedparcelable`
  - `billing`, `transport-api`, `transport-backend-cct`, `play-services-base`, `play-services-basement`, `play-services-tasks` (comments only)
  - `firebase-common`, `firebase-components`
  - `okio`, `kotlinx-coroutines-core`, `kotlinx-coroutines-android`
- akan-native's R8 step must pass every aar's `proguard.txt` as `--pg-conf`. R8 picks up jar-embedded `META-INF/proguard` and `META-INF/com.android.tools/r8*` rules from program input on its own.
- akan-native must also generate keep rules for manifest-referenced classes, which `aapt2 link --proguard` does, or add equivalent hand-written rules.

### 5.5 Native libraries
- `androidx.datastore:datastore-core-android:1.1.7` (FCM and union) ships `jni/{arm64-v8a,armeabi-v7a,x86,x86_64}/libdatastore_shared_counter.so`: 7,112 / 4,416 / 5,148 / 6,224 bytes.
- Every `LOAD` segment in them has `p_align = 0x4000`, so they are **16 KB page aligned**.
- It is used by `NativeSharedCounter` in DataStore's multi-process coordinator.
- akan-native's APK packaging currently handles no native libraries (no `jni` or `.so` handling in `packages/cli/src/platforms/android.ts`). It would need to copy these into `lib/<abi>/`, and use 16 KB zip alignment if they are stored uncompressed.

### 5.6 Not needed or ignorable
- `baseline-prof.txt` (lifecycle 2.6.2, startup), `lint.jar`, `annotations.zip`, `aidl/`, `third_party_licenses.*` (keep for notices) and `*.properties` Java resources in Play services jars.
- No aar has `assets/`.

## 6. Risks and surprises

1. **Both targets bring kotlinx-coroutines.**
   - FCM needs coroutines-core and play-services 1.9.0 because firebase-common uses them directly.
   - Billing brings coroutines-core and android 1.6.4 purely through AndroidX lifecycle 2.6.2; Billing's own code has no Kotlin references.
   - The akanjs decision already allows these as transitive dependencies of the opt-in modules, but it should be stated explicitly that kotlinx sits on the runtime classpath (and in the APK) whenever either module is enabled.
2. **FCM pulls in AndroidX DataStore** (7 artifacts, used for firebase-common's heartbeat storage). With it come Okio (a Square library), a shaded protobuf-lite (1 MB dex on its own), the `kotlinx.parcelize` and `kotlinx.android.*` runtimes, and **native `.so` files** for 4 ABIs. akan-native's Android build has none of the corresponding plumbing yet.
3. **Billing pulls `play-services-location` 19.0.0 and `places-placereport`, but its bytecode never references them.**
   - `play-services-base` and `-tasks` are also unreferenced by Billing's own classes, apart from the `KeepForSdk` annotation.
   - R8 would remove their code, but manifest entries (`GoogleApiActivity`, `gms.version` meta-data) and ~200 resource files still get merged.
   - Excluding them in akan-native's lock is possible but untested at runtime **(unverified)**.
4. **Billing sends telemetry through `transport-backend-cct`**, which is why a Billing-only app gains `INTERNET` and `ACCESS_NETWORK_STATE`. It also ships phenotype and experiment registration resources. Both FCM and Billing include datatransport and CCT, which matters for the Play Data safety form **(inference)**.
5. **The Billing-only metadata closure contains duplicate classes**: `kotlin-stdlib` 1.8.22 against `kotlin-stdlib-jdk7` and `-jdk8` 1.6.21, which d8 rejects. Gradle apps avoid this only through the Kotlin Gradle plugin's alignment. akan-native must strip the stdlib family and use its own 2.4.20.
6. **Versions depend on which modules are enabled** (for example `androidx.core` 1.9.0 vs 1.15.0, lifecycle 2.3.1 vs 2.6.2, coroutines 1.6.4 vs 1.9.0). A single lock needs either one pinned set per combination (FCM, Billing, both) or a single union version set. The union set grows FCM-only by 7 modules, including `startup`, `profileinstaller` and `kotlinx-coroutines-android`.
7. **Legacy support libraries come along**: `fragment` 1.1.0, `legacy-support-core-utils`, `loader`, `viewpager`, `customview`, `print`, `documentfile` and `localbroadcastmanager`. They are pulled by `play-services-basement`, `play-services-base` and `play-services-stats`.
8. **An `androidx.startup` `InitializationProvider` and an exported `ProfileInstallReceiver`** appear whenever Billing is enabled, through `androidx.core` 1.15.0 → lifecycle 2.6.2 → profileinstaller 1.3.0.
9. **Manifest merging is not optional**. `ComponentDiscoveryService` and `TransportBackendDiscovery` must be merged across aars. There are `${applicationId}` placeholders, `tools:` attributes and an `appComponentFactory` application attribute. Resource-backed meta-data (`@integer/google_play_services_version`) must resolve at link time; otherwise `GoogleApiAvailability` fails at runtime **(inference, standard behaviour)**.
10. **Method count**: the union plus stdlib reaches 59,615 method ids, so enabling both modules makes multi-dex effectively certain once app code is added.
11. **The Firebase BOM changes the resolution slightly** (`firebase-common` 22.2.1, `installations` 19.1.2). Decide whether akan-native pins "messaging's POM" or "latest BOM". Both are recorded.
12. **Licenses**: the Google aars embed repackaged third-party code (protobuf, Guava, Dagger and others, per `third_party_licenses.json`). Billing's POM license is the "Android Software Development Kit License", not Apache-2.0.

## Files

Everything is under `scratchpad/`:
- `s2-aar-report.md`: this report.
- `s2-lock.json`: lock draft with every distinct artifact: coordinate, url, sha256, size, packaging, and the closures it belongs to. It also lists closure memberships and the one metadata-only module.
- `s2/artifacts/`: downloaded aars and jars.
- `s2/resolved-*.json`: resolution graphs with who requested which version.
- `s2/inspect.json`: per-artifact inspection, including full manifests and ProGuard text.
- `s2/dex-results.json`, `s2/dex-each.json`, `s2/r8-results.json`: dex measurements.
- `s2/dex/`: dex outputs.
- Scripts: `resolve.py`, `download.py`, `inspect_art.py`, `dex.py`, `dex_each.py`, `r8est.py`, `gen_tables.py`, `assemble.py`.

## Appendix: every downloaded artifact (full SHA-256)

| Coordinate | File | Bytes | SHA-256 | Verified | URL |
|---|---|---:|---|---|---|
| `androidx.activity:activity:1.0.0` | activity-1.0.0.aar | 13,617 | `d1bc9842455c2e534415d88c44df4d52413b478db9093a1ba36324f705f44c3d` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/activity/activity/1.0.0/activity-1.0.0.aar |
| `androidx.activity:activity:1.2.3` | activity-1.2.3.aar | 67,451 | `1dce0705c334a6b2ef03382418dc7586f4e57ee23817267b403ea8cfc36c824e` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/activity/activity/1.2.3/activity-1.2.3.aar |
| `androidx.annotation:annotation-experimental:1.3.0` | annotation-experimental-1.3.0.aar | 36,019 | `abfd29c8556e5bd0325a9f769ab9e9d154ff4a5515c476cdd5a2a8285b1b19dc` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/annotation/annotation-experimental/1.3.0/annotation-experimental-1.3.0.aar |
| `androidx.annotation:annotation-experimental:1.4.1` | annotation-experimental-1.4.1.aar | 39,841 | `6bd4c7c7476f8260cd3bdbb81183583e93fc9f790c27dea7dc314181cbf87aa0` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/annotation/annotation-experimental/1.4.1/annotation-experimental-1.4.1.aar |
| `androidx.annotation:annotation:1.7.0` | annotation-jvm-1.7.0.jar | 55,232 | `e36b8e4b8393a4adc74e3d4ab22ad5a36396f0cea2e40b5734eae14937dfd224` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/annotation/annotation-jvm/1.7.0/annotation-jvm-1.7.0.jar |
| `androidx.annotation:annotation:1.8.1` | annotation-jvm-1.8.1.jar | 56,126 | `9aab326d9492800991854360ac248f493ce7f7c3183519309b78ace9e240f6f6` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/annotation/annotation-jvm/1.8.1/annotation-jvm-1.8.1.jar |
| `androidx.arch.core:core-common:2.1.0` | core-common-2.1.0.jar | 11,257 | `fe1237bf029d063e7f29fe39aeaf73ef74c8b0a3658486fc29d3c54326653889` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/arch/core/core-common/2.1.0/core-common-2.1.0.jar |
| `androidx.arch.core:core-common:2.2.0` | core-common-2.2.0.jar | 11,657 | `65308a06b1c00ee186cb9e19321383f043b993813f1522c47f4a3e3303bdba41` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/arch/core/core-common/2.2.0/core-common-2.2.0.jar |
| `androidx.arch.core:core-runtime:2.1.0` | core-runtime-2.1.0.aar | 6,059 | `dd77615bd3dd275afb11b62df25bae46b10b4a117cd37943af45bdcbf8755852` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/arch/core/core-runtime/2.1.0/core-runtime-2.1.0.aar |
| `androidx.arch.core:core-runtime:2.2.0` | core-runtime-2.2.0.aar | 7,577 | `a1be5e0caa2b07623862af6ae21b3ab0718123245184d0e30dea81b53f990a47` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/arch/core/core-runtime/2.2.0/core-runtime-2.2.0.aar |
| `androidx.collection:collection:1.1.0` | collection-1.1.0.jar | 42,953 | `632a0e5407461de774409352940e292a291037724207a787820c77daf7d33b72` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/collection/collection/1.1.0/collection-1.1.0.jar |
| `androidx.collection:collection:1.4.2` | collection-jvm-1.4.2.jar | 775,789 | `984ce9bd780055eafb8a105aca3f514686bf7b1b6272ec7c645a98ce40fc7db4` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/collection/collection-jvm/1.4.2/collection-jvm-1.4.2.jar |
| `androidx.concurrent:concurrent-futures:1.1.0` | concurrent-futures-1.1.0.jar | 25,987 | `0ce067c514a0d1049d1bebdf709e344ed3266fe9744275682937cdcb13334e9e` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/concurrent/concurrent-futures/1.1.0/concurrent-futures-1.1.0.jar |
| `androidx.core:core-ktx:1.15.0` | core-ktx-1.15.0.aar | 175,963 | `c72c97ff4a32308bcaf3061eea5ddf33455ce413cee4aa1d5c82440c5759d4bc` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/core/core-ktx/1.15.0/core-ktx-1.15.0.aar |
| `androidx.core:core:1.15.0` | core-1.15.0.aar | 1,336,135 | `432b85a1974076e14b487ece4a28c59a84f1b9efc3fc8be72cd7f05d32055e51` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/core/core/1.15.0/core-1.15.0.aar |
| `androidx.core:core:1.9.0` | core-1.9.0.aar | 1,115,684 | `8bda3ee3a88887d54f6679fb6b6cd788629f73234ac91c8bbed924e721ec85b8` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/core/core/1.9.0/core-1.9.0.aar |
| `androidx.customview:customview:1.0.0` | customview-1.0.0.aar | 33,238 | `20e5b8f6526a34595a604f56718da81167c0b40a7a94a57daa355663f2594df2` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/customview/customview/1.0.0/customview-1.0.0.aar |
| `androidx.datastore:datastore-core-okio:1.1.7` | datastore-core-okio-jvm-1.1.7.jar | 30,276 | `291506b4fce398249793e327207635bd4df25181d9539808d7181a4abd0875f5` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-core-okio-jvm/1.1.7/datastore-core-okio-jvm-1.1.7.jar |
| `androidx.datastore:datastore-core:1.1.7` | datastore-core-android-1.1.7.aar | 198,992 | `adca1d7cde73406fcca2a0eeabac63459adc9d1fe201b79ba08711fa2e331984` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-core-android/1.1.7/datastore-core-android-1.1.7.aar |
| `androidx.datastore:datastore-preferences-core:1.1.7` | datastore-preferences-core-android-1.1.7.aar | 36,753 | `31cebf4444b1df57876e695109a0a63c9a93ff05df503d27a3927b86af0cfac0` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-preferences-core-android/1.1.7/datastore-preferences-core-android-1.1.7.aar |
| `androidx.datastore:datastore-preferences-external-protobuf:1.1.7` | datastore-preferences-external-protobuf-1.1.7.jar | 1,048,830 | `fcb3f373cf743426c85ebb0d3cc644aefaf26f39b7fa55bb90238d41b689eca7` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-preferences-external-protobuf/1.1.7/datastore-preferences-external-protobuf-1.1.7.jar |
| `androidx.datastore:datastore-preferences-proto:1.1.7` | datastore-preferences-proto-1.1.7.jar | 25,751 | `63686a612f39b8ca603bebe3376d55fb6c9ee28a4a5173efa49c89cbcca8a127` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-preferences-proto/1.1.7/datastore-preferences-proto-1.1.7.jar |
| `androidx.datastore:datastore-preferences:1.1.7` | datastore-preferences-android-1.1.7.aar | 16,725 | `1b3d703abc765b60517334b04c5b520e6e25168a2f2d73d5b0cd975d20054f8d` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-preferences-android/1.1.7/datastore-preferences-android-1.1.7.aar |
| `androidx.datastore:datastore:1.1.7` | datastore-android-1.1.7.aar | 26,511 | `26c12c6417e7e4cfd36386aa8cc2b9839fe87a6792f820805827bde4d27f9e6e` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/datastore/datastore-android/1.1.7/datastore-android-1.1.7.aar |
| `androidx.documentfile:documentfile:1.0.0` | documentfile-1.0.0.aar | 11,221 | `865a061ef2fad16522f8433536b8d47208c46ff7c7745197dfa1eeb481869487` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/documentfile/documentfile/1.0.0/documentfile-1.0.0.aar |
| `androidx.fragment:fragment:1.1.0` | fragment-1.1.0.aar | 166,608 | `a14c8b8f2153f128e800fbd266a6beab1c283982a29ec570d2cc05d307d81496` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/fragment/fragment/1.1.0/fragment-1.1.0.aar |
| `androidx.interpolator:interpolator:1.0.0` | interpolator-1.0.0.aar | 7,669 | `33193135a64fe21fa2c35eec6688f1a76e512606c0fc83dc1b689e37add7732a` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/interpolator/interpolator/1.0.0/interpolator-1.0.0.aar |
| `androidx.legacy:legacy-support-core-utils:1.0.0` | legacy-support-core-utils-1.0.0.aar | 4,104 | `a7edcf01d5b52b3034073027bc4775b78a4764bb6202bb91d61c829add8dd1c7` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/legacy/legacy-support-core-utils/1.0.0/legacy-support-core-utils-1.0.0.aar |
| `androidx.lifecycle:lifecycle-common:2.3.1` | lifecycle-common-2.3.1.jar | 23,505 | `15848fb56db32f4c7cdc72b324003183d52a4884d6bf09be708ac7f587d139b5` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-common/2.3.1/lifecycle-common-2.3.1.jar |
| `androidx.lifecycle:lifecycle-common:2.6.2` | lifecycle-common-2.6.2.jar | 52,314 | `f34831b6c71cd844e1d35d1be49d5e79447c5ab856346531b1e8676fda7374b1` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-common/2.6.2/lifecycle-common-2.6.2.jar |
| `androidx.lifecycle:lifecycle-livedata-core:2.0.0` | lifecycle-livedata-core-2.0.0.aar | 8,372 | `fde334ec7e22744c0f5bfe7caf1a84c9d717327044400577bdf9bd921ec4f7bc` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-livedata-core/2.0.0/lifecycle-livedata-core-2.0.0.aar |
| `androidx.lifecycle:lifecycle-livedata-core:2.6.2` | lifecycle-livedata-core-2.6.2.aar | 11,345 | `2256780a3cff4a1e57fbb3d442557c17dc363ab8af105bcaf5261d8e2d5db949` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-livedata-core/2.6.2/lifecycle-livedata-core-2.6.2.aar |
| `androidx.lifecycle:lifecycle-livedata:2.0.0` | lifecycle-livedata-2.0.0.aar | 9,431 | `c82609ced8c498f0a701a30fb6771bb7480860daee84d82e0a81ee86edf7ba39` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-livedata/2.0.0/lifecycle-livedata-2.0.0.aar |
| `androidx.lifecycle:lifecycle-livedata:2.6.2` | lifecycle-livedata-2.6.2.aar | 18,971 | `67359f609dfc2bf65da1270b23033f856064ec279f058e0a70c715f7c9003031` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-livedata/2.6.2/lifecycle-livedata-2.6.2.aar |
| `androidx.lifecycle:lifecycle-runtime:2.3.1` | lifecycle-runtime-2.3.1.aar | 11,230 | `dd294f4a689c71ff877fd41f3b67a3a62f7760d44ce420e6130f1fc3569d8f00` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-runtime/2.3.1/lifecycle-runtime-2.3.1.aar |
| `androidx.lifecycle:lifecycle-runtime:2.6.2` | lifecycle-runtime-2.6.2.aar | 21,738 | `4867fd5279742fba8388821930cb2affe06d81a52814e7e41e70392ea0ef887c` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-runtime/2.6.2/lifecycle-runtime-2.6.2.aar |
| `androidx.lifecycle:lifecycle-viewmodel-savedstate:2.6.2` | lifecycle-viewmodel-savedstate-2.6.2.aar | 39,786 | `7bc7dcbab17636ec076f12afe4d02671265c389457b1b366b37a0e8cb91e2da0` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-viewmodel-savedstate/2.6.2/lifecycle-viewmodel-savedstate-2.6.2.aar |
| `androidx.lifecycle:lifecycle-viewmodel:2.1.0` | lifecycle-viewmodel-2.1.0.aar | 8,647 | `ba55fb7ac1b2828d5327cda8acf7085d990b2b4c43ef336caa67686249b8523d` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-viewmodel/2.1.0/lifecycle-viewmodel-2.1.0.aar |
| `androidx.lifecycle:lifecycle-viewmodel:2.6.2` | lifecycle-viewmodel-2.6.2.aar | 39,793 | `e4ff4338999e1c6c9c724719f5d4aa7dd61bf6f545d5256a27a9d375df9f2330` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/lifecycle/lifecycle-viewmodel/2.6.2/lifecycle-viewmodel-2.6.2.aar |
| `androidx.loader:loader:1.0.0` | loader-1.0.0.aar | 33,445 | `11f735cb3b55c458d470bed9e25254375b518b4b1bad6926783a7026db0f5025` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/loader/loader/1.0.0/loader-1.0.0.aar |
| `androidx.localbroadcastmanager:localbroadcastmanager:1.0.0` | localbroadcastmanager-1.0.0.aar | 6,808 | `e71c328ceef5c4a7d76f2d86df1b65d65fe2acf868b1a4efd84a3f34336186d8` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/localbroadcastmanager/localbroadcastmanager/1.0.0/localbroadcastmanager-1.0.0.aar |
| `androidx.print:print:1.0.0` | print-1.0.0.aar | 15,782 | `1d5c7f3135a1bba661fc373fd72e11eb0a4adbb3396787826dd8e4190d5d9edd` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/print/print/1.0.0/print-1.0.0.aar |
| `androidx.profileinstaller:profileinstaller:1.3.0` | profileinstaller-1.3.0.aar | 47,529 | `34e8b2bfc74e23c1525e3da903ae449b7f1b440aef45e18159ee470e91997f48` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/profileinstaller/profileinstaller/1.3.0/profileinstaller-1.3.0.aar |
| `androidx.savedstate:savedstate:1.0.0` | savedstate-1.0.0.aar | 9,768 | `2510a5619c37579c9ce1a04574faaf323cd0ffe2fc4e20fa8f8f01e5bb402e83` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/savedstate/savedstate/1.0.0/savedstate-1.0.0.aar |
| `androidx.savedstate:savedstate:1.2.1` | savedstate-1.2.1.aar | 20,217 | `21a7d4bcf6bdb94ad7b9283801529300b4fbb8808ca4f191e0cdce6fd8e4705a` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/savedstate/savedstate/1.2.1/savedstate-1.2.1.aar |
| `androidx.startup:startup-runtime:1.1.1` | startup-runtime-1.1.1.aar | 19,371 | `e0a6329a371262fe4c450372b70fdaf33b769ef6917094723787cfce896b1dd3` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/startup/startup-runtime/1.1.1/startup-runtime-1.1.1.aar |
| `androidx.tracing:tracing:1.2.0` | tracing-1.2.0.aar | 6,060 | `6faa90390d1fdbf0adb9a99bf99de67b94c6c6f35aea9510593a9d17973736a2` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/androidx/tracing/tracing/1.2.0/tracing-1.2.0.aar |
| `androidx.versionedparcelable:versionedparcelable:1.1.1` | versionedparcelable-1.1.1.aar | 31,061 | `57e8d93260d18d5b9007c9eed3c64ad159de90c8609ebfc74a347cbd514535a4` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/versionedparcelable/versionedparcelable/1.1.1/versionedparcelable-1.1.1.aar |
| `androidx.viewpager:viewpager:1.0.0` | viewpager-1.0.0.aar | 53,513 | `147af4e14a1984010d8f155e5e19d781f03c1d70dfed02a8e0d18428b8fc8682` | sha1:OK | https://dl.google.com/dl/android/maven2/androidx/viewpager/viewpager/1.0.0/viewpager-1.0.0.aar |
| `com.android.billingclient:billing-ktx:9.1.0` | billing-ktx-9.1.0.aar | 71,724 | `21883d01509e984c2555374d710700e1cfa56996f95c7cb4cb7b384e167aa41c` | sha1:OK | https://dl.google.com/dl/android/maven2/com/android/billingclient/billing-ktx/9.1.0/billing-ktx-9.1.0.aar |
| `com.android.billingclient:billing:9.1.0` | billing-9.1.0.aar | 543,478 | `d28286d4e4c18725510980de01211d9b72501e7146d96817fa0c9999af9b0d22` | sha1:OK | https://dl.google.com/dl/android/maven2/com/android/billingclient/billing/9.1.0/billing-9.1.0.aar |
| `com.google.android.datatransport:transport-api:3.0.0` | transport-api-3.0.0.aar | 4,898 | `4e6983c0703b357df6f1c6ceacb1b5dfc2c5006a789c799fec2298b2b5337466` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-api/3.0.0/transport-api-3.0.0.aar |
| `com.google.android.datatransport:transport-api:3.1.0` | transport-api-3.1.0.aar | 8,464 | `7dafc39f0ea835473366acc346f7e67fc8443f4c645d999c3e987bcad6b88c7b` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-api/3.1.0/transport-api-3.1.0.aar |
| `com.google.android.datatransport:transport-backend-cct:3.1.8` | transport-backend-cct-3.1.8.aar | 35,074 | `e17edd1ef7fd475c90baa4e39422332f27087d34bcb46cb48ce86af9a54a612e` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-backend-cct/3.1.8/transport-backend-cct-3.1.8.aar |
| `com.google.android.datatransport:transport-backend-cct:3.1.9` | transport-backend-cct-3.1.9.aar | 53,551 | `07a32025a65b08ee7e11d14dc539a758b66713f0c1d13900a81599ceadbaf44d` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-backend-cct/3.1.9/transport-backend-cct-3.1.9.aar |
| `com.google.android.datatransport:transport-runtime:3.1.8` | transport-runtime-3.1.8.aar | 112,298 | `cb9353ef1791ae17097d878ca711e25a9c32cec9042adc49b00cadfee1a7290b` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-runtime/3.1.8/transport-runtime-3.1.8.aar |
| `com.google.android.datatransport:transport-runtime:3.1.9` | transport-runtime-3.1.9.aar | 179,644 | `41745c5b8f427d24439015b84f651ad420718991867d2afc262c264009b802c1` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/datatransport/transport-runtime/3.1.9/transport-runtime-3.1.9.aar |
| `com.google.android.gms:play-services-base:18.5.0` | play-services-base-18.5.0.aar | 439,602 | `59a5c0c2da12311d75d965ce1f419498536b1a167fb28ff7dfc2dfd9cefa4157` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-base/18.5.0/play-services-base-18.5.0.aar |
| `com.google.android.gms:play-services-base:18.9.0` | play-services-base-18.9.0.aar | 614,902 | `a071d2f2b09a81182db7b10fe62f5ce24ec8646529400ff1423f9be1178c2cb5` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-base/18.9.0/play-services-base-18.9.0.aar |
| `com.google.android.gms:play-services-basement:18.9.0` | play-services-basement-18.9.0.aar | 439,122 | `c6ed7236b1b3ce0296b508a5c0a09108fd52d83559d35cad2639505cd04ab255` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-basement/18.9.0/play-services-basement-18.9.0.aar |
| `com.google.android.gms:play-services-cloud-messaging:17.4.0` | play-services-cloud-messaging-17.4.0.aar | 93,057 | `c525314ab50fb6bb915da1dab99ea71b45fdb2aeb5ea6b857e7b9562ebbb8c85` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-cloud-messaging/17.4.0/play-services-cloud-messaging-17.4.0.aar |
| `com.google.android.gms:play-services-location:19.0.0` | play-services-location-19.0.0.aar | 182,560 | `6b205c43ba5df751eca8ce9dae7a58effafac7d637fb4fc708a7522d1b99cf80` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-location/19.0.0/play-services-location-19.0.0.aar |
| `com.google.android.gms:play-services-places-placereport:17.0.0` | play-services-places-placereport-17.0.0.aar | 15,733 | `2c7fd63ad02f28150ae4ffe4615dac7d694d790e2c4667f777aedc8ee054e929` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-places-placereport/17.0.0/play-services-places-placereport-17.0.0.aar |
| `com.google.android.gms:play-services-stats:17.0.2` | play-services-stats-17.0.2.aar | 14,753 | `dd4314a53f49a378ec146103d36232b96c75454d29526336ccbdf132941764d3` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-stats/17.0.2/play-services-stats-17.0.2.aar |
| `com.google.android.gms:play-services-tasks:18.2.0` | play-services-tasks-18.2.0.aar | 80,343 | `7f2aaa8f502068eaf54356ca92aec04271d6e7c416c52c45c0d23440fcbd1654` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-tasks/18.2.0/play-services-tasks-18.2.0.aar |
| `com.google.android.gms:play-services-tasks:18.4.0` | play-services-tasks-18.4.0.aar | 99,861 | `e3f7666ca0532142ab7c0c3f4e2dbf34113d590c3542845ce03ce79ea6b83d29` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-tasks/18.4.0/play-services-tasks-18.4.0.aar |
| `com.google.errorprone:error_prone_annotations:2.26.0` | error_prone_annotations-2.26.0.jar | 18,988 | `53cdfc0beb2d766fe03b78f0b11d020554cd419879d20380c38fa1dcf2ba1b50` |  | https://dl.google.com/dl/android/maven2/com/google/errorprone/error_prone_annotations/2.26.0/error_prone_annotations-2.26.0.jar |
| `com.google.firebase:firebase-annotations:17.0.0` | firebase-annotations-17.0.0.jar | 3,517 | `f80305e6f7b5d111278d4df9504f51f7230e06c6457a0fa7c16e236c7613cc71` | module-sha256:OK, sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-annotations/17.0.0/firebase-annotations-17.0.0.jar |
| `com.google.firebase:firebase-common:22.0.1` | firebase-common-22.0.1.aar | 121,072 | `33c4cbac4692f61c49ec5dde9111ae0a295e6c0e7f0c3d722498edd67947995c` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-common/22.0.1/firebase-common-22.0.1.aar |
| `com.google.firebase:firebase-common:22.2.1` | firebase-common-22.2.1.aar | 121,194 | `877c5ff39da0932ac9ecdc23471cbfc4bd48b67167f3f695766e970f531c0780` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-common/22.2.1/firebase-common-22.2.1.aar |
| `com.google.firebase:firebase-components:19.0.0` | firebase-components-19.0.0.aar | 45,744 | `5d79597f7774b2f68ad57e91c2592e89ecef4d09a5f1c5c03c75f573f00cb3e4` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-components/19.0.0/firebase-components-19.0.0.aar |
| `com.google.firebase:firebase-datatransport:18.2.0` | firebase-datatransport-18.2.0.aar | 5,825 | `b2b28f6ba173f5e0c4fe3d36a2d7ee5239c7acbf4143b549ecf031a3485b35bb` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-datatransport/18.2.0/firebase-datatransport-18.2.0.aar |
| `com.google.firebase:firebase-encoders-json:18.0.0` | firebase-encoders-json-18.0.0.aar | 9,223 | `80aece7e1ef58957ca2fc1957bc9208ec92a3a9528201331d3c63e3182570f97` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-encoders-json/18.0.0/firebase-encoders-json-18.0.0.aar |
| `com.google.firebase:firebase-encoders-proto:16.0.0` | firebase-encoders-proto-16.0.0.jar | 38,980 | `293db96a0d1d43f033167881b638d8fde844e4e5495f5101cf52295765295e0e` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-encoders-proto/16.0.0/firebase-encoders-proto-16.0.0.jar |
| `com.google.firebase:firebase-encoders:17.0.0` | firebase-encoders-17.0.0.jar | 17,847 | `282a5a703f9b7eb56508dde97ea918e95d73318b157050f457f7a86dca750150` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-encoders/17.0.0/firebase-encoders-17.0.0.jar |
| `com.google.firebase:firebase-iid-interop:17.1.0` | firebase-iid-interop-17.1.0.aar | 8,426 | `0b7c3721c84b62e70415307239ed4a7f998989084bf2833f90b9f5bea3095a05` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-iid-interop/17.1.0/firebase-iid-interop-17.1.0.aar |
| `com.google.firebase:firebase-installations-interop:17.3.0` | firebase-installations-interop-17.3.0.aar | 6,646 | `8d8f643fdee27700c4cc865b38c6fe834a9e3f569e4eaa219ba3567dae794276` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-installations-interop/17.3.0/firebase-installations-interop-17.3.0.aar |
| `com.google.firebase:firebase-installations:19.1.1` | firebase-installations-19.1.1.aar | 56,436 | `50b2f43e2853cb7bea93b6f2022db0bbc33a388de51ae94ecbab565b9dcfd9fa` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-installations/19.1.1/firebase-installations-19.1.1.aar |
| `com.google.firebase:firebase-installations:19.1.2` | firebase-installations-19.1.2.aar | 56,450 | `3a561cba4bce00fa6ff515857ccc9d5550bc1ee239549799a091486137c2f3da` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-installations/19.1.2/firebase-installations-19.1.2.aar |
| `com.google.firebase:firebase-measurement-connector:19.0.0` | firebase-measurement-connector-19.0.0.aar | 10,625 | `dba74d6bf94647ee397bf7afb2ab07f6fe8d13157e56785fa540a2a13ed82c99` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-measurement-connector/19.0.0/firebase-measurement-connector-19.0.0.aar |
| `com.google.firebase:firebase-messaging:25.1.3` | firebase-messaging-25.1.3.aar | 156,493 | `cabf7ad0610e41777b1e79f1c0b76073f1a1b372aa9ff83007627860cb8dcf15` | sha1:OK | https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-messaging/25.1.3/firebase-messaging-25.1.3.aar |
| `com.google.guava:listenablefuture:1.0` | listenablefuture-1.0.jar | 3,149 | `e4ad7607e5c0477c6f890ef26a49cb8d1bb4dffb650bab4502afee64644e3069` |  | https://dl.google.com/dl/android/maven2/com/google/guava/listenablefuture/1.0/listenablefuture-1.0.jar |
| `com.squareup.okio:okio:3.4.0` | okio-jvm-3.4.0.jar | 360,090 | `0139ec7a506dbbd54cad62291b019cb850534be097c8c66c1000d5fbe8edef3e` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/com/squareup/okio/okio-jvm/3.4.0/okio-jvm-3.4.0.jar |
| `javax.inject:javax.inject:1` | javax.inject-1.jar | 2,497 | `91c77044a50c481636c32d916fd89c9118a72195390452c81065080f957de7ff` |  | https://dl.google.com/dl/android/maven2/javax/inject/javax.inject/1/javax.inject-1.jar |
| `org.jetbrains.kotlin:kotlin-android-extensions-runtime:1.9.22` | kotlin-android-extensions-runtime-1.9.22.jar | 9,709 | `f00537c7023e604933f6a9563b1bb3b83e61fbfd2cc3d0e9900d616bab6862a4` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-android-extensions-runtime/1.9.22/kotlin-android-extensions-runtime-1.9.22.jar |
| `org.jetbrains.kotlin:kotlin-parcelize-runtime:1.9.22` | kotlin-parcelize-runtime-1.9.22.jar | 7,000 | `f0077f35ec828e148ac92d0c6aa141a732b5eb7a4a391679aeefa59fa9a1a5cc` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-parcelize-runtime/1.9.22/kotlin-parcelize-runtime-1.9.22.jar |
| `org.jetbrains.kotlin:kotlin-stdlib-common:1.8.22` | kotlin-stdlib-common-1.8.22.jar | 221,491 | `d0c2365e2437ef70f34586d50f055743f79716bcfe65e4bc7239cdd2669ef7c5` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib-common/1.8.22/kotlin-stdlib-common-1.8.22.jar |
| `org.jetbrains.kotlin:kotlin-stdlib-common:2.2.10` | (no file: metadata-only variant) | 0 | - | - | - |
| `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.6.21` | kotlin-stdlib-jdk7-1.6.21.jar | 23,898 | `f1b0634dbb94172038463020bb2dd45ca26849f8ce29d625acb0f1569d11dbee` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk7/1.6.21/kotlin-stdlib-jdk7-1.6.21.jar |
| `org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.0` | kotlin-stdlib-jdk7-1.8.0.jar | 963 | `4c889d1d9803f5f2eb6c1592a6b7e62369ac7660c9eee15aba16fec059163666` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk7/1.8.0/kotlin-stdlib-jdk7-1.8.0.jar |
| `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.6.21` | kotlin-stdlib-jdk8-1.6.21.jar | 17,772 | `dab45489b47736d59fce44b80676f1947a9b6bcab10fd60e878a83bd82a6954c` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk8/1.6.21/kotlin-stdlib-jdk8-1.6.21.jar |
| `org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.0` | kotlin-stdlib-jdk8-1.8.0.jar | 968 | `05b62804441b0c9a1920b6b7d5cf7329a4e24b6258478e32b1f046ca01900946` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk8/1.8.0/kotlin-stdlib-jdk8-1.8.0.jar |
| `org.jetbrains.kotlin:kotlin-stdlib:1.8.22` | kotlin-stdlib-1.8.22.jar | 1,670,469 | `03a5c3965cc37051128e64e46748e394b6bd4c97fa81c6de6fc72bfd44e3421b` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/kotlin/kotlin-stdlib/1.8.22/kotlin-stdlib-1.8.22.jar |
| `org.jetbrains.kotlin:kotlin-stdlib:2.0.21` | kotlin-stdlib-2.0.21.jar | 1,747,660 | `f31cc53f105a7e48c093683bbd5437561d1233920513774b470805641bedbc09` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/2.0.21/kotlin-stdlib-2.0.21.jar |
| `org.jetbrains.kotlin:kotlin-stdlib:2.2.10` | kotlin-stdlib-2.2.10.jar | 1,750,374 | `9c67cc79efd6b9215b49d2a4308f5f3433537376c7c88e89bdd6729bd096e61a` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/2.2.10/kotlin-stdlib-2.2.10.jar |
| `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4` | kotlinx-coroutines-android-1.6.4.jar | 19,520 | `3fdc0eed5bc4b83ee9622774520a2db25470370eacd1581cac1e37704f095b00` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-android/1.6.4/kotlinx-coroutines-android-1.6.4.jar |
| `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0` | kotlinx-coroutines-android-1.9.0.jar | 19,247 | `bd783acd2f9738845d58380f46f45b5cde95d0cb03027d56725338b26bfc4d72` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-android/1.9.0/kotlinx-coroutines-android-1.9.0.jar |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.4` | kotlinx-coroutines-core-jvm-1.6.4.jar | 1,476,653 | `c24c8bb27bb320c4a93871501a7e5e0c61607638907b197aef675513d4c820be` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.6.4/kotlinx-coroutines-core-jvm-1.6.4.jar |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0` | kotlinx-coroutines-core-jvm-1.9.0.jar | 1,463,587 | `ad89c2892235e670f222d819cb3d81188143cb19a05b59df9889ae4269f5c70a` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.9.0/kotlinx-coroutines-core-jvm-1.9.0.jar |
| `org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0` | kotlinx-coroutines-play-services-1.9.0.jar | 10,642 | `4cb6b6321df1664b99fee756de63f6af65ccb4f68936f26cf76c211dea1b23ae` | module-sha256:OK, sha1:OK | https://repo1.maven.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-play-services/1.9.0/kotlinx-coroutines-play-services-1.9.0.jar |
| `org.jetbrains:annotations:13.0` | annotations-13.0.jar | 17,536 | `ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/annotations/13.0/annotations-13.0.jar |
| `org.jetbrains:annotations:23.0.0` | annotations-23.0.0.jar | 29,371 | `7b0f19724082cbfcbc66e5abea2b9bc92cf08a1ea11e191933ed43801eb3cd05` |  | https://dl.google.com/dl/android/maven2/org/jetbrains/annotations/23.0.0/annotations-23.0.0.jar |
