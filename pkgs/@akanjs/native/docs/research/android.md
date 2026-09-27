# Android 셸 조사·프로토타입 (M4)

> 대상 문서: [architecture.md](../architecture.md) §3.1·§3.5·§4·§5·§6·§8, [requirements.md](../requirements.md) Q6·Q7·SH-*·WV-*·SEC-1 · 작성 2026-09-25
> 검증 환경: macOS · Android SDK build-tools **36.1.0**, platforms **android-36** · kotlinc **2.4.20**(Homebrew, JRE 27에서 실행) · JDK 21(keytool) · 에뮬레이터 `Pixel_10` AVD = **Android 17(API 37)**, google_apis_playstore, arm64, 16KB page · **WebView 153.0.8010.36**
> 프로토타입 원본: `/private/tmp/claude-501/-Users-kangminseon-github-study/a6137b94-0c15-4f44-a151-6d5bde136a1d/scratchpad/proto-android/`. 임시 폴더라 지워질 수 있어서 재사용할 코드는 모두 §2에 붙였다.
> 표기: **[검증]** 에뮬레이터·도구로 직접 실행해서 확인 · **[코드]** 참고 코드·SDK를 읽어서 확인 · **[추론]** 실행하지 않은 판단

## 1. 결론 요약

| 항목 | 결론 | 근거 |
|---|---|---|
| **Q7** 리소스 없이 `aapt2 link` + 프레임워크 테마로 APK를 만들 수 있나 | **된다.** `aapt2 link --manifest AndroidManifest.xml -I android.jar -A assets`만으로 설치·실행되는 APK가 나온다. `res/`도 `aapt2 compile`도 필요 없다. aapt2가 빈 `resources.arsc`(40B)를 만들어 **STORED + 4바이트 정렬**로 넣으므로 targetSdk 30+ 설치 조건도 맞는다. 테마 `@android:style/Theme.DeviceDefault.DayNight`, 앱 이름은 매니페스트 문자열 리터럴. **한계**: 아이콘이 없고(런처 기본 아이콘), 창·스플래시 배경색을 지정할 수 없고, 프레임워크의 DayNight 테마에는 NoActionBar 변형이 없어 코드에서 `requestWindowFeature(FEATURE_NO_TITLE)`을 부른다. 배경색·아이콘이 필요하면 `aapt2 compile --dir res` 한 단계만 추가하면 된다(검증, §2.6). | [검증] |
| **Q6** edge-to-edge에서 `env(safe-area-inset-*)`가 동작하나 | **WebView 153에서 동작한다.** 조건은 `viewport-fit=cover`. top 55px(네이티브 54.1dp), bottom 24px(제스처 바), cover가 없으면 0. 키보드가 떠 있으면 WebView가 bottom을 스스로 0으로 바꾼다. Capacitor는 WebView **140 미만**(safe-area 미지원)과 **144 미만**(키보드 표시 중 bottom 오류)을 따로 우회한다. 그래서 akan-native는 WebView 주 버전이 140 미만일 때만 CSS 변수(`--akan-native-safe-area-*`)를 주입하면 된다. 주입 코드도 검증했다. | [검증] WebView 153 한 버전만 확인. 140/144 경계는 [코드] |
| **SEC-1** 브리지를 앱 오리진으로 제한 | `addJavascriptInterface` 객체는 **교차 오리진 iframe에도 주입된다.** `https://other.localhost` iframe이 `preferences.set`을 호출해 실제로 값을 저장했다(`pwned=by-iframe`). iframe 로드에는 `shouldOverrideUrlLoading`이 불리지 않으므로 "이동 허용 목록"으로는 막을 수 없다. 프레임워크에는 `addWebMessageListener`와 `addDocumentStartJavaScript`가 **없다**(API 36·36.1은 javap, API 37은 실행 중 리플렉션으로 확인). **프레임워크 API만으로 되는 해법**은 `createWebMessageChannel` + `postWebMessage(targetOrigin = https://app.localhost)`이다. JS가 `message` 리스너를 먼저 등록하고 `fetch("/__akan_native/hello")`로 알리면, 네이티브가 앱 오리진인 메인 프레임에만 포트를 보낸다. 주입 객체가 0개가 되고, iframe은 브리지를 쓸 수 없다(검증). 왕복 0.1~1ms. → **아키텍처 §3.5·§4 변경 제안(§4.1)** | [검증] |
| Gradle 없는 빌드 | aapt2 → kotlinc → d8/R8 → dex 추가 → zipalign → apksigner로 동작한다. d8만 쓰면 kotlin-stdlib 전체가 들어가 **dex 2.33~2.64MB**가 되고, R8을 쓰면 **dex 66KB, APK 78KB**다. `zip`·`zipalign` 대신 **Bun으로 쓴 약 100줄짜리 APK 조립기**(정렬 포함)도 검증했다. 개발 빌드는 kotlin-stdlib을 한 번만 dex로 만들어 `classes2.dex`로 넣고 앱 코드만 d8하면 0.5초다. | [검증] |
| 에셋 서빙 | `shouldInterceptRequest`(Chromium `ThreadPoolForeg` 스레드, 여러 개가 동시에 호출)로 MIME, 404(statusText 포함), SPA 폴백, `init.js`, `/__akan_native/file/<id>`가 모두 동작한다. `isSecureContext === true`, fetch·XHR 정상. **Range는 WebView가 요청의 시작 오프셋만큼 스트림을 직접 `skip()`한다.** 그래서 "206 + Content-Range + 건너뛰지 않은 스트림을 end+1에서 자르기"가 맞다. 직접 skip하면 두 번 건너뛰게 되어 실패한다(검증). | [검증] |
| 키보드 | `WindowInsets.Type.ime()`로 높이·표시 여부(312dp)를, `WindowInsetsAnimation.Callback.onStart`로 시작 시점(285ms 애니메이션)을 얻는다. WebView 153은 `interactive-widget`을 무시하고, 기본 동작은 resizes-visual(화면을 밀어 올림)이다. 고정 하단 UI를 키보드 위에 두려면 셸이 컨테이너에 IME 높이만큼 padding을 준다("pad" 모드, Capacitor와 같은 방식). 숨기기는 `InputMethodManager.hideSoftInputFromWindow`로 동작했다. | [검증] |
| 앱 상태 | onResume = active, onPause = inactive, onStop = background. HOME, 권한 대화상자, 재실행으로 확인했다. `onNewIntent`가 올 때 inactive→active가 한 번 바뀐다. | [검증] |
| 뒤로가기 | `OnBackInvokedCallback`을 **히스토리가 있을 때만 등록**하면 루트에서는 시스템 동작(태스크를 뒤로 보냄, 프로세스 유지)이 그대로 남는다. 사용자 제스처 없이 `pushState`한 항목은 Chromium이 건너뛰므로 `canGoBack()`이 false다. | [검증] |
| 카메라 | **AndroidX FileProvider 없이 60줄짜리 ContentProvider**로 `ACTION_IMAGE_CAPTURE` + `EXTRA_OUTPUT`이 동작한다. camera2가 `openFile(mode=w)`로 63KB JPEG를 썼고, `/__akan_native/file/f1`로 1440×1920 이미지가 로드됐다. **매니페스트에 CAMERA를 선언하면 허용 전까지 `SecurityException`이 난다.** 그래서 camera 플러그인은 CAMERA를 선언하지 않는다(아키텍처 §6 예시 수정). 갤러리는 프레임워크 Photo Picker(`MediaStore.ACTION_PICK_IMAGES`)를 쓴다. `getUserMedia`는 CAMERA 런타임 권한 + `onPermissionRequest` grant로 동작한다. 촬영 중 프로세스가 죽으면 결과는 도착하지만 JS 호출이 사라진다. | [검증] |
| Preferences | `getSharedPreferences("akan-native.preferences", MODE_PRIVATE)` + `apply()`. `shared_prefs/akan-native.preferences.xml`에 저장되는 것을 확인했다. | [검증] |
| 다크 모드 | DayNight 테마를 쓰면 `prefers-color-scheme`이 시스템 설정을 따른다. `configChanges`에 `uiMode`가 있으면 액티비티를 다시 만들지 않아도 `matchMedia` change 이벤트가 오고, 상태 표시줄 아이콘 색도 바뀐다. algorithmic darkening은 끈다. | [검증] |
| 디버깅 | `aapt2 link --debug-mode`로 debuggable APK를 만들면 `setWebContentsDebuggingEnabled`를 부르지 않아도 devtools 소켓이 열린다. debuggable이 아니면 호출해야 열린다. console → logcat은 `onConsoleMessage`로 보낸다. | [검증] |
| 콜드 스타트(참고) | `am start -W` TotalTime: debug 446~584ms, d8 release 256~357ms, R8 240~291ms. onCreate부터 onPageFinished까지 250~440ms. | [검증] 에뮬레이터 수치 |

## 2. 검증한 프로토타입

### 2.1 구성

```
proto-android/
├─ AndroidManifest.xml
├─ build.sh                   전체 빌드 (zip + zipalign 경로). ./build.sh [nocam|cam] [debug|release|r8]
├─ apk.ts                     Bun APK 조립기 (zip·zipalign 대체)
├─ proguard-akan-native.pro          R8 규칙
├─ res/values*/akan-native.xml       (선택) 사용자 테마 검증용
├─ src/com/akanjs/proto/        AkanNativeActivity.kt · AkanNativeBridge.kt · AkanNativeAssetServer.kt · AkanNativeFileProvider.kt · Plugins.kt
├─ assets/app/                index.html(자동 테스트 페이지) · data.json · app.js · img/logo.svg · iw.html
├─ assets/proto-transport.js  @akanjs/native/core Android 전송 대역. assets/app 밖에 있으므로 URL로는 노출되지 않는다
└─ assets/other-frame.html    교차 오리진 iframe 공격 페이지 (https://other.localhost 로 서빙)
```

테스트 페이지(`index.html`)는 로드되자마자 전 항목을 돌리고 `console.log("AKAN_NATIVE_RESULT <tag> {...}")`를 남긴다. logcat의 `AkanNativeConsole` 태그로 결과를 읽는다. 프로토타입 전용 요소(실제 셸에서는 뺀다): `other.localhost` 응답, intent extra(`transport`, `imeMode`, `nodebug`, `plainRange`, `js`), `ProtoPlugin`, `iface` 전송, 로그.

### 2.2 AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.akanjs.proto"
    android:versionCode="1"
    android:versionName="0.1.0">

    <uses-sdk android:minSdkVersion="35" android:targetSdkVersion="36" />

    <uses-permission android:name="android.permission.INTERNET" />
    <!--CAMERA_PERMISSION-->

    <application
        android:label="AkanNative Proto"
        android:theme="@android:style/Theme.DeviceDefault.DayNight"
        android:allowBackup="false"
        android:supportsRtl="true"
        android:enableOnBackInvokedCallback="true">

        <activity
            android:name=".AkanNativeActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|density|keyboard|keyboardHidden|navigation|uiMode|locale|layoutDirection|fontScale|fontWeightAdjustment|colorMode|touchscreen|mcc|mnc|grammaticalGender">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Framework-only replacement for androidx FileProvider (camera EXTRA_OUTPUT target) -->
        <provider
            android:name=".AkanNativeFileProvider"
            android:authorities="com.akanjs.proto.akan_native_files"
            android:exported="false"
            android:grantUriPermissions="true" />
    </application>
</manifest>
```
- `<!--CAMERA_PERMISSION-->`은 `build.sh cam` 변형에서 `<uses-permission android:name="android.permission.CAMERA"/>`로 바뀐다.
- `<queries>`는 필요 없다. `resolveActivity()`를 부르지 않고 `startActivity`에서 `ActivityNotFoundException`을 잡는다. 이렇게 해도 camera2가 실행되는 것을 확인했다.
- `configChanges`에 넣은 값은 모두 aapt2가 받아들였다(`grammaticalGender`는 API 34+, `fontWeightAdjustment`는 API 31+). 회전이나 다크 모드 전환 때 액티비티를 다시 만들지 않는다. 다시 만들면 WebView도 새로 로드된다.

### 2.3 빌드 명령 (순서대로)

```sh
SDK=~/Library/Android/sdk; BT=$SDK/build-tools/36.1.0; AJ=$SDK/platforms/android-36/android.jar
STDLIB=/opt/homebrew/Cellar/kotlin/2.4.20/libexec/lib/kotlin-stdlib.jar   # doctor.ts kotlinStdlib() 규칙 (Homebrew는 libexec/lib)

# 1. 매니페스트 + assets만으로 링크 (res/ 없음, aapt2 compile 없음)
$BT/aapt2 link -o base.apk --manifest AndroidManifest.xml -I $AJ -A assets \
  --min-sdk-version 35 --target-sdk-version 36 --version-code 1 --version-name 0.1.0 --debug-mode   # release에서는 --debug-mode 제외

# 2. Kotlin 컴파일: android.jar + stdlib만 클래스패스에 둔다
kotlinc src -d classes.jar -classpath $AJ:$STDLIB -jvm-target 17 -no-jdk -no-stdlib -no-reflect
#   release: -Xno-param-assertions -Xno-call-assertions -Xno-receiver-assertions 추가

# 3a. dex (d8): kotlin-stdlib 전체가 들어간다
$BT/d8 --debug --min-api 35 --lib $AJ --output dex/ classes.jar $STDLIB        # 또는 --release
# 3b. dex (R8): 필요 없는 stdlib 코드를 제거한다
java -cp $BT/lib/d8.jar com.android.tools.r8.R8 --release --min-api 35 --lib $AJ \
  --pg-conf proguard-akan-native.pro --pg-map-output mapping.txt --output dex/ classes.jar $STDLIB

# 4. classes.dex를 STORED(-0)로 추가. aapt2는 dex를 넣을 수 없다
cp base.apk unaligned.apk && (cd dex && zip -q -0 -X ../unaligned.apk classes.dex)

# 5. 정렬 (STORED 항목을 4바이트 경계에 맞춘다. -p는 .so를 page 정렬하며, .so가 없으면 영향 없다)
$BT/zipalign -p -f 4 unaligned.apk aligned.apk

# 6. 디버그 키 (없을 때 한 번 만든다. 실제 CLI는 ~/.akan/native/debug.keystore) + 서명
keytool -genkeypair -keystore debug.keystore -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" -noprompt
$BT/apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey \
  --v1-signing-enabled false --out app.apk aligned.apk
$BT/apksigner verify -v app.apk        # → "Verified using v3 scheme: true" (v1/v2 false)
```

플래그 메모
- `-no-jdk`: kotlinc가 자기가 도는 JRE(Homebrew openjdk 27)의 클래스를 클래스패스에 넣지 않게 한다. `java.*`는 android.jar의 것을 쓰므로, Android에 없는 JDK API를 쓰면 컴파일 에러가 난다.
- `-no-stdlib`는 stdlib을 자동으로 추가하지 않게 하고(클래스패스에 직접 넣는다), `-no-reflect`는 kotlin-reflect를 뺀다. kotlinc는 android.jar의 nullability 어노테이션을 읽는다. 예를 들어 `WebResourceResponse`의 reasonPhrase 자리에 `String?`를 넘기면 컴파일 에러가 나는데, 실제로 겪었다.
- `-jvm-target 17`은 d8 36.1에서 문제없었다(21은 미검증).
- R8 규칙: stdlib이 컴파일 전용 `annotations-13.0.jar`를 참조하므로 `-dontwarn org.jetbrains.annotations.**`가 **필수**다. 없으면 `Missing class org.jetbrains.annotations.NotNull` 에러가 난다. R8 CLI는 매니페스트를 읽지 않으므로 Activity·Provider·`@JavascriptInterface`를 직접 keep한다. Homebrew의 kotlin-stdlib.jar에는 내장 R8 규칙이 없다.
- apksigner: minSdk 35라서 v3 서명만 들어간다. `--v1-signing-enabled false`를 빼면 쓸모없는 `META-INF/*.SF|RSA|MF`가 추가된다.
- keytool: JDK 21의 기본 형식은 PKCS12라서 storepass와 keypass가 같아야 한다.
- `--debug-mode`는 `android:debuggable="true"`를 넣는다. 그래야 `run-as`가 되고 WebView devtools가 자동으로 켜진다.
- aapt2 `-A`의 압축: 텍스트(html/js/svg)는 deflate하고, 압축 이득이 없는 작은 파일과 미디어 확장자는 STORED로 둔다. `AssetManager.open()`은 둘 다 읽는다.

`build.sh` (위 단계를 그대로 담은 스크립트. macOS bash 3.2에서 `set -u`와 빈 배열을 함께 쓰려면 `${A[@]+"${A[@]}"}` 형태가 필요하다):

```sh
#!/bin/bash
# Gradle-less APK build. Usage: ./build.sh [nocam|cam] [debug|release|r8]
set -euo pipefail
cd "$(dirname "$0")"
VARIANT=${1:-nocam}; MODE=${2:-debug}
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}
BT=$SDK/build-tools/36.1.0
AJ=$SDK/platforms/android-36/android.jar
KHOME=$(dirname "$(dirname "$(realpath "$(command -v kotlinc)")")")
STDLIB=$( [ -f "$KHOME/lib/kotlin-stdlib.jar" ] && echo "$KHOME/lib/kotlin-stdlib.jar" || echo "$KHOME/libexec/lib/kotlin-stdlib.jar" )
OUT=build/$VARIANT-$MODE
rm -rf "$OUT"; mkdir -p "$OUT/dex"
ts() { python3 -c 'import time;print(int(time.time()*1000))'; }

# 0. manifest variant (plugin permissions get merged here by the real CLI)
if [ "$VARIANT" = cam ]; then
  sed 's#<!--CAMERA_PERMISSION-->#<uses-permission android:name="android.permission.CAMERA" />#' AndroidManifest.xml > "$OUT/AndroidManifest.xml"
else
  cp AndroidManifest.xml "$OUT/AndroidManifest.xml"
fi

# 1. aapt2 link: manifest + assets only (no res/, no aapt2 compile step)
t=$(ts)
DBG=(); [ "$MODE" = debug ] && DBG=(--debug-mode)
"$BT/aapt2" link -o "$OUT/base.apk" --manifest "$OUT/AndroidManifest.xml" -I "$AJ" -A assets \
  --min-sdk-version 35 --target-sdk-version 36 --version-code 1 --version-name 0.1.0 ${DBG[@]+"${DBG[@]}"}
echo "aapt2 link: $(( $(ts) - t ))ms"

# 2. kotlinc against android.jar only (no JDK classes, stdlib only as a library)
t=$(ts)
KFLAGS=(); [ "$MODE" != debug ] && KFLAGS=(-Xno-param-assertions -Xno-call-assertions -Xno-receiver-assertions)
kotlinc src -d "$OUT/classes.jar" -classpath "$AJ:$STDLIB" -jvm-target 17 -no-jdk -no-stdlib -no-reflect ${KFLAGS[@]+"${KFLAGS[@]}"} 2>&1 | grep -v '^warning: .*deprecated' || true
[ -f "$OUT/classes.jar" ] || { echo "kotlinc failed"; exit 1; }
echo "kotlinc: $(( $(ts) - t ))ms"

# 3. dex: d8 (debug/release) or R8 (shrink kotlin-stdlib)
t=$(ts)
case "$MODE" in
  debug)   "$BT/d8" --debug   --min-api 35 --lib "$AJ" --output "$OUT/dex" "$OUT/classes.jar" "$STDLIB" ;;
  release) "$BT/d8" --release --min-api 35 --lib "$AJ" --output "$OUT/dex" "$OUT/classes.jar" "$STDLIB" ;;
  r8)      java -cp "$BT/lib/d8.jar" com.android.tools.r8.R8 --release --min-api 35 --lib "$AJ" \
             --pg-conf proguard-akan-native.pro --pg-map-output "$OUT/mapping.txt" --output "$OUT/dex" "$OUT/classes.jar" "$STDLIB" ;;
esac
echo "dex ($MODE): $(( $(ts) - t ))ms  $(ls -l "$OUT/dex/classes.dex" | awk '{print $5}') bytes"

# 4. add classes.dex to the APK, STORED (-0) so ART can map it; zip -X drops extra attrs
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -0 -X ../unaligned.apk classes.dex)

# 5. align (stored entries on 4-byte boundaries; -p page-aligns .so files, harmless without them)
"$BT/zipalign" -p -f 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"

# 6. sign with an auto-created debug key (real CLI: ~/.akan/native/debug.keystore)
KS=debug.keystore
[ -f $KS ] || keytool -genkeypair -keystore $KS -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" -noprompt
"$BT/apksigner" sign --ks $KS --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --v1-signing-enabled false \
  --out "$OUT/app.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs -v "$OUT/app.apk" | grep -E 'Verified using|Signer #1 certificate DN' || true
ls -l "$OUT/app.apk" | awk '{print "APK:", $5, "bytes"}'
```

`proguard-akan-native.pro`:

```
# Shell entry points referenced from the manifest are kept automatically? No: R8 CLI has no manifest input.
-keep class com.akanjs.proto.AkanNativeActivity { *; }
-keep class com.akanjs.proto.AkanNativeFileProvider { *; }
# JavascriptInterface methods are looked up by name from JS
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keepattributes *Annotation*,SourceFile,LineNumberTable
-dontobfuscate
# kotlin-stdlib is compiled against the compile-only annotations-13.0.jar
-dontwarn org.jetbrains.annotations.**
```

### 2.4 측정

| 빌드 | 단계 시간 | classes.dex | APK |
|---|---|---|---|
| debug (d8 `--debug`, `--debug-mode`) | aapt2 80~310ms · kotlinc 3.1~3.8s · d8 2.2~2.5s | 2,643,128 B | 2,654,881 B |
| release (d8 `--release`) | d8 2.1~2.3s | 2,330,384 B | 2,343,585 B |
| **R8** | R8 1.85~1.9s | **66,496 B** | **78,497 B** |
| 개발용 multidex (§2.7) | stdlib 사전 dex 2.5s(한 번만) + 앱만 d8 **0.49s** | 80,192 B + 2,569,592 B | – |

- d8만 쓰면 kotlin-stdlib 전체(약 2.3MB)가 그대로 dex에 들어간다. NF-2(모바일 셸 수 MB 이내)는 d8로도 지킬 수 있지만, release는 R8을 쓴다.
- 전체 빌드 시간은 kotlinc의 JVM 시작이 대부분이다. HTML만 바뀐 재빌드는 Kotlin 컴파일을 건너뛰도록 캐시하는 것이 좋다(§4.4).
- 설치(`adb install -r`)는 50~200ms 걸렸다.

### 2.5 Bun APK 조립기 (`zip`·`zipalign` 대체)

aapt2 출력(매니페스트 + resources.arsc)의 항목을 바이트 그대로 복사하고, `classes.dex`는 STORED로, `assets/**`는 텍스트면 deflate·미디어면 STORED로 추가한다. STORED 항목은 zipalign과 같은 0xD935 extra 필드로 데이터 시작을 4바이트 경계에 맞춘다. 날짜는 1980-01-01로 고정해서 빌드 결과가 매번 같다.

```ts
// Minimal APK assembler in Bun (replaces `zip` + `zipalign`):
//   bun apk.ts <aapt2-base.apk> <classes.dex> <assetsDir> <out-unsigned.apk>
// - copies the aapt2 entries (AndroidManifest.xml, resources.arsc, ...) byte-for-byte (keeps their compression)
// - adds classes.dex STORED, assets/** (deflate for text, store for already-compressed media)
// - every STORED entry's data starts on a 4-byte boundary (0xD935 alignment extra field, like zipalign 4)
// Output must still be signed with apksigner (v2/v3 signatures cover the whole file, so sign last).
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

type Entry = { name: string; method: 0 | 8; crc: number; csize: number; usize: number; data: Uint8Array };

const STORE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "mp4", "webm", "mp3", "m4a", "ogg", "woff", "woff2", "zip", "gz", "br"]);
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, fixed for reproducible builds

function readZip(buf: Uint8Array): Entry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("no EOCD");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad central header");
    const method = dv.getUint16(p + 10, true) as 0 | 8;
    const crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    const dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    out.push({ name, method, crc, csize, usize, data: buf.subarray(dataStart, dataStart + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

function fileEntry(name: string, bytes: Uint8Array, store: boolean): Entry {
  const crc = Bun.hash.crc32(bytes) >>> 0;
  if (!store) {
    const d = deflateRawSync(bytes, { level: 9 });
    if (d.length < bytes.length) return { name, method: 8, crc, csize: d.length, usize: bytes.length, data: d };
  }
  return { name, method: 0, crc, csize: bytes.length, usize: bytes.length, data: bytes };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function writeZip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name);
    let extra = new Uint8Array(0);
    if (e.method === 0) {
      const base = off + 30 + name.length;
      let pad = (4 - ((base + 6) % 4)) % 4;           // 0xD935 record: id(2) size(2) align(2) + padding
      extra = new Uint8Array(6 + pad);
      const xv = new DataView(extra.buffer);
      xv.setUint16(0, 0xd935, true); xv.setUint16(2, 2 + pad, true); xv.setUint16(4, 4, true);
    }
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, e.method, true); lv.setUint16(10, 0, true); lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, e.crc, true); lv.setUint32(18, e.csize, true); lv.setUint32(22, e.usize, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, extra.length, true);
    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, e.method, true); cv.setUint16(12, 0, true); cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, e.crc, true); cv.setUint32(20, e.csize, true); cv.setUint32(24, e.usize, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, off, true);
    central.push(ch, name);
    chunks.push(lh, name, extra, e.data);
    off += 30 + name.length + extra.length + e.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = [...chunks, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

const [base, dex, assetsDir, outPath] = Bun.argv.slice(2);
const entries = readZip(new Uint8Array(await Bun.file(base).arrayBuffer()));
entries.push(fileEntry("classes.dex", new Uint8Array(await Bun.file(dex).arrayBuffer()), true));
for (const f of walk(assetsDir).sort()) {
  const rel = relative(assetsDir, f).split("\\").join("/");
  const ext = rel.split(".").pop()!.toLowerCase();
  entries.push(fileEntry("assets/" + rel, new Uint8Array(await Bun.file(f).arrayBuffer()), STORE_EXT.has(ext)));
}
await Bun.write(outPath, writeZip(entries));
console.log(`wrote ${outPath}: ${entries.length} entries`);
```

```sh
$BT/aapt2 link -o base.apk --manifest AndroidManifest.xml -I $AJ --min-sdk-version 35 --target-sdk-version 36 ...   # -A 없이
bun apk.ts base.apk dex/classes.dex assets unsigned.apk
$BT/zipalign -c -v 4 unsigned.apk     # 검증용: "Verification successful"
$BT/apksigner sign --ks debug.keystore --ks-pass pass:android --v1-signing-enabled false --out app.apk unsigned.apk
```
결과: 78,497 B. 설치·실행됐고, 보안 컨텍스트·SPA·Range·브리지·Preferences 테스트를 모두 통과했다 [검증]. v2/v3 서명은 파일 전체를 덮으므로 서명은 반드시 마지막에 한다.

### 2.6 (선택) 사용자 테마: 창·스플래시 배경색 (SH-3)

```xml
<!-- res/values/akan-native.xml -->
<resources>
    <color name="akan_native_bg">#FFFFFFFF</color>
    <style name="AkanNativeTheme" parent="@android:style/Theme.DeviceDefault.DayNight">
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionBar">false</item>
        <item name="android:windowBackground">@color/akan_native_bg</item>
        <item name="android:windowSplashScreenBackground">@color/akan_native_bg</item>
    </style>
</resources>
<!-- res/values-night/akan-native.xml -->
<resources>
    <color name="akan_native_bg">#FF121212</color>
</resources>
```
```sh
$BT/aapt2 compile --dir res -o res.zip                 # values_akan_native.arsc.flat 등
$BT/aapt2 link -o base.apk --manifest AndroidManifest.xml -I $AJ res.zip --min-sdk-version 35 ...   # 매니페스트 theme="@style/AkanNativeTheme"
```
resources.arsc가 852B가 됐고, 설치·실행을 확인했다 [검증]. 이 테마를 쓰면 `requestWindowFeature` 호출이 필요 없다. Android 12+의 시스템 스플래시는 `windowSplashScreenBackground`를 쓴다(스플래시 색 자체는 눈으로 확인하지 않았다 [추론]).

### 2.7 개발 빌드 가속: kotlin-stdlib 사전 dex + native multidex

```sh
$BT/d8 --debug --min-api 35 --lib $AJ --output std/ $STDLIB                              # 2.5s, 한 번만 (Kotlin 버전별로 캐시)
$BT/d8 --debug --min-api 35 --lib $AJ --classpath $STDLIB --output app/ classes.jar      # 0.49s
# APK: app/classes.dex → classes.dex, std/classes.dex → classes2.dex  (둘 다 STORED)
```
minSdk 21 이상은 multidex를 기본으로 지원하므로 설치·실행이 정상이었다 [검증].

### 2.8 Kotlin 소스

`AkanNativeActivity.kt`: WebView 설정, 클라이언트, insets·IME, 수명주기, 뒤로가기, 결과·권한 라우팅

```kotlin
package com.akanjs.proto

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Insets
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import android.view.Window
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject

const val TAG = "AkanNativeProto"

class AkanNativeActivity : Activity() {
    lateinit var webView: WebView
    lateinit var bridge: AkanNativeBridge
    private lateinit var server: AkanNativeAssetServer
    private lateinit var root: FrameLayout

    private val results = HashMap<Int, (Int, Intent?) -> Unit>()
    private val permResults = HashMap<Int, (Map<String, Boolean>) -> Unit>()
    private var nextReq = 1000
    private val t0 = SystemClock.uptimeMillis()

    /** "pad": shrink the WebView by the IME height (and zero the bottom bar inset) · "none": do nothing */
    var imeMode = "pad"
    var lastInsets: JSONObject = JSONObject()
    var appState = "inactive"

    private val backCallback = OnBackInvokedCallback {
        Log.i(TAG, "back invoked canGoBack=${webView.canGoBack()}")
        bridge.emit("appState", "backButton", JSONObject().put("canGoBack", webView.canGoBack()))
        if (webView.canGoBack()) webView.goBack()
        webView.post { updateBackCallback() }
    }
    private var backRegistered = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Theme.DeviceDefault.DayNight has an action bar and no NoActionBar variant in the framework.
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        val bg = if (isNight()) Color.rgb(18, 18, 18) else Color.WHITE
        window.setBackgroundDrawable(ColorDrawable(bg))          // SH-3: no white flash
        imeMode = intent.getStringExtra("imeMode") ?: "pad"

        if (!intent.getBooleanExtra("nodebug", false)) WebView.setWebContentsDebuggingEnabled(true)   // WV-2 (dev builds only)
        webView = WebView(this)
        webView.setBackgroundColor(bg)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            isAlgorithmicDarkeningAllowed = false
            setSupportZoom(false)
        }

        bridge = AkanNativeBridge(this, webView)
        server = AkanNativeAssetServer(this, bridge)
        bridge.transport = intent.getStringExtra("transport") ?: "port"
        registerPlugins(bridge)
        if (bridge.transport != "port-fetch") webView.addJavascriptInterface(bridge.JsInterface(), "__akan_nativeAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                server.intercept(request)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                Log.i(TAG, "shouldOverrideUrlLoading $u main=${request.isForMainFrame} gesture=${request.hasGesture()}")
                if (u.scheme == "https" && u.host == AkanNativeAssetServer.HOST) return false
                if (!request.isForMainFrame) return u.host != "other.localhost"   // prototype: allow the test iframe only
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE))
                } catch (e: ActivityNotFoundException) {
                    Log.w(TAG, "no activity for $u")
                }
                return true                                         // SH-4: never leave the app origin
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                Log.i(TAG, "onPageStarted +${SystemClock.uptimeMillis() - t0}ms $url")
                bridge.onPageStarted()
            }

            override fun onPageFinished(view: WebView, url: String) {
                Log.i(TAG, "onPageFinished +${SystemClock.uptimeMillis() - t0}ms $url")
                root.requestApplyInsets()                           // re-push CSS insets into the new document
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                // canGoBack() is still stale inside this callback (verified): check on the next loop turn.
                Log.i(TAG, "doUpdateVisitedHistory $url canGoBack(now)=${view.canGoBack()}")
                view.post { updateBackCallback() }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Returning false kills the app. Throw the WebView away and start over.
                Log.e(TAG, "renderer gone crashed=${detail.didCrash()}")
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {       // WV-3
                val pri = when (m.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.ERROR
                    ConsoleMessage.MessageLevel.WARNING -> Log.WARN
                    ConsoleMessage.MessageLevel.DEBUG -> Log.DEBUG
                    else -> Log.INFO
                }
                Log.println(pri, "AkanNativeConsole", "${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {     // getUserMedia
                Log.i(TAG, "onPermissionRequest ${request.origin} ${request.resources.toList()}")
                if (request.origin.host != AkanNativeAssetServer.HOST) { request.deny(); return }
                val wantCam = PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources
                if (!wantCam) { request.deny(); return }
                askPermissions(arrayOf(Manifest.permission.CAMERA)) { r ->
                    if (r[Manifest.permission.CAMERA] == true) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    else request.deny()
                }
            }

            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                Log.i(TAG, "onShowFileChooser accept=${params.acceptTypes.toList()} capture=${params.isCaptureEnabled}")
                try {
                    startForResult(params.createIntent()) { code, data -> cb.onReceiveValue(FileChooserParams.parseResult(code, data)) }
                } catch (e: ActivityNotFoundException) {
                    cb.onReceiveValue(null)
                }
                return true
            }
        }

        root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        installInsets()

        webView.loadUrl(AkanNativeAssetServer.ORIGIN + "/")
        Log.i(TAG, "onCreate done +${SystemClock.uptimeMillis() - t0}ms webview=${WebView.getCurrentWebViewPackage()?.versionName}")
    }

    // ── insets: safe area + IME (Q6, useKeyboard) ──
    private fun installInsets() {
        val bars = WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
        val ime = WindowInsets.Type.ime()
        root.setOnApplyWindowInsetsListener { v, insets ->
            val sys = insets.getInsets(bars)
            val imeIns = insets.getInsets(ime)
            val imeVisible = insets.isVisible(ime)
            val d = resources.displayMetrics.density
            val kb = if (imeVisible) maxOf(0, imeIns.bottom - sys.bottom) else 0   // height above the nav bar (RN)
            lastInsets = JSONObject()
                .put("top", sys.top / d).put("right", sys.right / d).put("bottom", sys.bottom / d).put("left", sys.left / d)
                .put("imeVisible", imeVisible).put("imeBottom", imeIns.bottom / d).put("keyboardHeight", kb / d)
                .put("mode", imeMode)
            Log.i(TAG, "insets $lastInsets")
            bridge.emit("keyboard", "change", JSONObject().put("visible", imeVisible).put("height", kb / d))
            pushCssInsets(sys, imeVisible, d)
            if (imeMode == "pad") {
                v.setPadding(0, 0, 0, if (imeVisible) imeIns.bottom else 0)
                // Bars under the keyboard no longer overlap the WebView → report bottom 0 to it.
                WindowInsets.Builder(insets)
                    .setInsets(bars, Insets.of(sys.left, sys.top, sys.right, if (imeVisible) 0 else sys.bottom))
                    .build()
            } else insets
        }
        root.setWindowInsetsAnimationCallback(object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            override fun onStart(a: WindowInsetsAnimation, b: WindowInsetsAnimation.Bounds): WindowInsetsAnimation.Bounds {
                if (a.typeMask and ime != 0) {
                    val end = root.rootWindowInsets                 // already the end state here
                    val showing = end?.isVisible(ime) == true
                    Log.i(TAG, "ime anim start showing=$showing dur=${a.durationMillis}")
                    bridge.emit("keyboard", if (showing) "willShow" else "willHide", JSONObject().put("duration", a.durationMillis))
                }
                return b
            }
            override fun onProgress(insets: WindowInsets, running: MutableList<WindowInsetsAnimation>): WindowInsets = insets
            override fun onEnd(a: WindowInsetsAnimation) {
                if (a.typeMask and ime != 0) Log.i(TAG, "ime anim end")
            }
        })
    }

    /** Fallback for Q6: the same numbers as CSS variables (dp == CSS px at default zoom). */
    private fun pushCssInsets(sys: Insets, imeVisible: Boolean, d: Float) {
        val js = "document.documentElement&&(function(s){s.setProperty('--akan-native-safe-top','${sys.top / d}px');s.setProperty('--akan-native-safe-right','${sys.right / d}px');" +
            "s.setProperty('--akan-native-safe-bottom','${(if (imeVisible) 0 else sys.bottom) / d}px');s.setProperty('--akan-native-safe-left','${sys.left / d}px')})(document.documentElement.style)"
        webView.evaluateJavascript(js, null)
    }

    // ── back (SH-5): only intercept while there is history, so the system back-to-home animation works at the root ──
    private fun updateBackCallback() {
        val want = webView.canGoBack()
        if (want && !backRegistered) onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback)
        if (!want && backRegistered) onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
        backRegistered = want
        Log.i(TAG, "back callback registered=$want")
    }

    // ── lifecycle → useAppState ──
    private fun setState(s: String) {
        appState = s
        Log.i(TAG, "appState $s")
        bridge.emit("appState", "change", JSONObject().put("state", s))
    }
    override fun onResume() { super.onResume(); setState("active") }
    override fun onPause() { super.onPause(); setState("inactive") }
    override fun onStop() { super.onStop(); setState("background") }
    override fun onDestroy() {
        bridge.destroy()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val bg = if (isNight()) Color.rgb(18, 18, 18) else Color.WHITE
        window.setBackgroundDrawable(ColorDrawable(bg))
        webView.setBackgroundColor(bg)
        Log.i(TAG, "config changed night=${isNight()}")
        webView.evaluateJavascript("window.__protoReport&&__protoReport('configChanged')", null)
    }

    private fun isNight() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    // prototype automation: am start ... --es js "<code>"
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("js")?.let { webView.evaluateJavascript(it, null) }
    }

    // ── activity results / permissions for plugins (framework APIs, no ActivityResult API) ──
    fun startForResult(intent: Intent, cb: (Int, Intent?) -> Unit) {
        val code = nextReq++
        results[code] = cb
        try {
            startActivityForResult(intent, code)
        } catch (e: RuntimeException) {             // ActivityNotFoundException, SecurityException
            results.remove(code)
            throw e
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        Log.i(TAG, "onActivityResult req=$requestCode result=$resultCode data=$data")
        results.remove(requestCode)?.invoke(resultCode, data) ?: super.onActivityResult(requestCode, resultCode, data)
    }

    fun askPermissions(perms: Array<String>, cb: (Map<String, Boolean>) -> Unit) {
        val missing = perms.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) { cb(perms.associateWith { true }); return }
        val code = nextReq++
        permResults[code] = cb
        requestPermissions(missing.toTypedArray(), code)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        val cb = permResults.remove(requestCode) ?: return
        cb(permissions.indices.associate { permissions[it] to (grantResults.getOrNull(it) == PackageManager.PERMISSION_GRANTED) })
    }
}
```

`AkanNativeBridge.kt`: 플러그인 규격(§6) 초안, 디스패치, 두 가지 전송(JS 인터페이스 / MessagePort)

```kotlin
package com.akanjs.proto

import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

// ── plugin spec (architecture §6) ─────────────────────────────────────────

interface AkanNativePlugin {
    val id: String
    val methods: List<String>
    /** Runs on the akan-native-plugins thread. Must eventually call call.resolve / call.reject. */
    fun call(method: String, args: JSONObject, call: AkanNativeCall)
    /** Subscriber count for an event changed ($listen / $unlisten). */
    fun onListenerCount(event: String, count: Int) {}
}

interface AkanNativePluginContext {
    val activity: AkanNativeActivity
    fun emit(plugin: String, event: String, data: Any?)
    fun registerFile(file: File, mime: String): String
    fun runOnMain(block: () -> Unit)
    fun startActivityForResult(intent: Intent, cb: (resultCode: Int, data: Intent?) -> Unit)
    fun requestPermissions(perms: Array<String>, cb: (Map<String, Boolean>) -> Unit)
}

class AkanNativeCall internal constructor(
    val id: Long,
    val plugin: String,
    val method: String,
    private val reply: (String) -> Unit,
) {
    private var done = false

    @Synchronized fun resolve(result: Any? = null) {
        if (done) return
        done = true
        val m = JSONObject().put("v", 1).put("id", id).put("ok", true)
        if (result != null) m.put("result", result)
        reply(m.toString())
    }

    @Synchronized fun reject(code: String, message: String) {
        if (done) return
        done = true
        val err = JSONObject().put("code", code).put("message", message)
        reply(JSONObject().put("v", 1).put("id", id).put("ok", false).put("error", err).toString())
    }
}

// ── bridge ────────────────────────────────────────────────────────────────

class AkanNativeBridge(override val activity: AkanNativeActivity, private val webView: WebView) : AkanNativePluginContext {
    private val main = Handler(Looper.getMainLooper())
    private val workerThread = HandlerThread("akan-native-plugins").apply { start() }
    val worker = Handler(workerThread.looper)

    private val plugins = LinkedHashMap<String, AkanNativePlugin>()
    private val listeners = HashMap<String, Int>()           // "plugin/event" → count (worker thread only)
    private val files = ConcurrentHashMap<String, Pair<File, String>>()
    private val fileSeq = AtomicLong(1)

    @Volatile private var port: WebMessagePort? = null       // native end of the MessageChannel
    private var portOffered = false                          // main thread: one port per document
    @Volatile var transport = "iface"                        // "iface" | "port" (chosen per page load)

    fun register(p: AkanNativePlugin) { plugins[p.id] = p }

    /** { pluginId: [methods] } for init.js (architecture §3.1). */
    fun pluginTable(): JSONObject {
        val o = JSONObject()
        for ((id, p) in plugins) o.put(id, JSONArray(p.methods))
        return o
    }

    fun file(id: String): Pair<File, String>? = files[id]

    // Transport 1: addJavascriptInterface. Visible to EVERY frame (incl. cross-origin iframes).
    inner class JsInterface {
        @JavascriptInterface
        fun postMessage(json: String) {
            Log.i(TAG, "iface.postMessage thread=${Thread.currentThread().name} len=${json.length}")
            worker.post { dispatch(json) { resp -> evalReceive(resp) } }
        }

        /** Doorbell for transport 2: carries no data and grants nothing. The port is only
         *  delivered to the main frame if its origin is the app origin. */
        @JavascriptInterface
        fun hello() {
            Log.i(TAG, "iface.hello thread=${Thread.currentThread().name}")
            main.post { openPort() }
        }
    }

    // Transport 2: framework MessageChannel (API 23). Origin-restricted delivery.
    fun openPort() {
        // One-shot per navigation: a (cross-origin) iframe can ring the doorbell too; re-creating the
        // port would kill the main frame's in-flight calls.
        if (portOffered) { Log.w(TAG, "hello ignored (port already offered)"); return }
        portOffered = true
        val pair = webView.createWebMessageChannel()
        val native = pair[0]
        native.setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(p: WebMessagePort, message: WebMessage) {
                // Delivered directly on the worker looper (Handler argument below).
                Log.i(TAG, "port.onMessage thread=${Thread.currentThread().name}")
                dispatch(message.data) { resp -> p.postMessage(WebMessage(resp)) }
            }
        }, worker)
        port = native
        webView.postWebMessage(WebMessage("akan-native:port", arrayOf(pair[1])), Uri.parse(AkanNativeAssetServer.ORIGIN))
        Log.i(TAG, "port posted to ${AkanNativeAssetServer.ORIGIN}")
    }

    fun onPageStarted() {
        port?.close()
        port = null
        portOffered = false
        worker.post { listeners.clear() }
    }

    // ── dispatch (worker thread) ──
    private fun dispatch(json: String, reply: (String) -> Unit) {
        val req = try { JSONObject(json) } catch (e: JSONException) {
            Log.w(TAG, "drop malformed message"); return
        }
        val id = req.optLong("id", -1)
        val pluginId = req.optString("plugin")
        val method = req.optString("method")
        val call = AkanNativeCall(id, pluginId, method, reply)
        if (req.optInt("v") != 1 || id < 0 || pluginId.isEmpty() || method.isEmpty()) {
            call.reject("INVALID_ARGS", "malformed request"); return
        }
        val plugin = plugins[pluginId] ?: run { call.reject("NOT_FOUND", "plugin $pluginId"); return }
        val args = req.optJSONObject("args") ?: JSONObject()
        if (method == "\$listen" || method == "\$unlisten") {
            val event = args.optString("event")
            val key = "$pluginId/$event"
            val n = maxOf(0, (listeners[key] ?: 0) + if (method == "\$listen") 1 else -1)
            listeners[key] = n
            plugin.onListenerCount(event, n)
            call.resolve(); return
        }
        if (method !in plugin.methods) { call.reject("NOT_FOUND", "$pluginId.$method"); return }
        try {
            plugin.call(method, args, call)
        } catch (e: Exception) {
            Log.e(TAG, "plugin error", e)
            call.reject("INTERNAL", e.toString())
        }
    }

    // ── host → JS ──
    private fun evalReceive(json: String) {
        val js = "window.__AKAN_NATIVE__&&__AKAN_NATIVE__.receive(${jsSafe(json)})"
        main.post { webView.evaluateJavascript(js, null) }
    }

    override fun emit(plugin: String, event: String, data: Any?) {
        worker.post {
            if ((listeners["$plugin/$event"] ?: 0) == 0) return@post
            val m = JSONObject().put("v", 1).put("plugin", plugin).put("event", event)
            if (data != null) m.put("data", data)
            val s = m.toString()
            val p = port
            if (transport == "port" && p != null) p.postMessage(WebMessage(s)) else evalReceive(s)
        }
    }

    override fun registerFile(file: File, mime: String): String {
        val id = "f" + fileSeq.getAndIncrement()
        files[id] = file to mime
        return "/__akan_native/file/$id"
    }

    override fun runOnMain(block: () -> Unit) { main.post(block) }
    override fun startActivityForResult(intent: Intent, cb: (Int, Intent?) -> Unit) =
        main.post { activity.startForResult(intent, cb) }.let {}
    override fun requestPermissions(perms: Array<String>, cb: (Map<String, Boolean>) -> Unit) =
        main.post { activity.askPermissions(perms, cb) }.let {}

    fun destroy() { workerThread.quitSafely() }

    companion object {
        /** org.json output is valid JS; escape the two line terminators anyway (pre-ES2019 engines
         *  treat them as newlines inside string literals). '/' is already escaped as '\/'. */
        fun jsSafe(json: String): String = json.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    }
}
```

`AkanNativeAssetServer.kt`: `https://app.localhost` 서빙, init.js, `/__akan_native/hello`, Range

```kotlin
package com.akanjs.proto

import android.content.res.AssetManager
import android.util.Log
import android.webkit.MimeTypeMap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import org.json.JSONObject

/**
 * Serves https://app.localhost/ from APK assets/app/ (architecture §5).
 * Called on a Chromium background thread (not the UI thread), possibly concurrently.
 */
class AkanNativeAssetServer(private val activity: AkanNativeActivity, private val bridge: AkanNativeBridge) {
    companion object {
        const val HOST = "app.localhost"
        const val ORIGIN = "https://$HOST"
        const val ROOT = "app"

        private val MIME = mapOf(
            "html" to "text/html", "htm" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript",
            "css" to "text/css", "json" to "application/json", "map" to "application/json",
            "txt" to "text/plain", "xml" to "application/xml", "svg" to "image/svg+xml",
            "png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "gif" to "image/gif",
            "webp" to "image/webp", "avif" to "image/avif", "ico" to "image/x-icon",
            "wasm" to "application/wasm", "woff" to "font/woff", "woff2" to "font/woff2",
            "ttf" to "font/ttf", "otf" to "font/otf", "mp4" to "video/mp4", "webm" to "video/webm",
            "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "wav" to "audio/wav", "ogg" to "audio/ogg",
            "pdf" to "application/pdf",
        )
        private val REASON = mapOf(
            200 to "OK", 206 to "Partial Content", 400 to "Bad Request", 403 to "Forbidden",
            404 to "Not Found", 405 to "Method Not Allowed", 416 to "Range Not Satisfiable",
            500 to "Internal Server Error",
        )

        fun mimeFor(path: String): String {
            val ext = path.substringAfterLast('/').substringAfterLast('.', "").lowercase()
            return MIME[ext] ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        }
    }

    private val assets: AssetManager = activity.assets
    @Volatile var loggedThread = false

    fun intercept(req: WebResourceRequest): WebResourceResponse? {
        val url = req.url
        if (!loggedThread) {
            loggedThread = true
            Log.i(TAG, "shouldInterceptRequest thread=${Thread.currentThread().name}")
        }
        if (url.host == "other.localhost") {                                      // prototype-only test origin
            Log.d(TAG, "req-other ${req.method} ${url} main=${req.isForMainFrame} headers=${req.requestHeaders}")
            return otherOrigin(url.path ?: "/")
        }
        if (url.scheme != "https" || url.host != HOST) return null               // real network
        Log.d(TAG, "req ${req.method} ${url.path} main=${req.isForMainFrame} headers=${req.requestHeaders}")
        if (req.method != "GET" && req.method != "HEAD") return error(405)

        val segs = url.pathSegments                                              // already percent-decoded
        if (segs.any { it == ".." || it == "." || it.contains('\u0000') }) return error(400)
        val path = "/" + segs.joinToString("/")

        if (path.startsWith("/__akan_native/")) {
            return when {
                path == "/__akan_native/init.js" -> text(200, "text/javascript", initJs())
                // Doorbell without any injected Java object: JS fetches this after adding its
                // "message" listener; the port still goes only to an app-origin main frame.
                path == "/__akan_native/hello" -> { activity.runOnUiThread { bridge.openPort() }; WebResourceResponse("text/plain", null, 204, "No Content", baseHeaders(), ByteArrayInputStream(ByteArray(0))) }
                path.startsWith("/__akan_native/file/") -> servePluginFile(path.removePrefix("/__akan_native/file/"), req)
                else -> error(404)
            }
        }

        val rel = if (path == "/" || url.path?.endsWith("/") == true) "$path/index.html".replace("//", "/") else path
        val asset = ROOT + rel
        val stream = openAsset(asset)
        if (stream != null) return serveStream(stream, mimeFor(rel), req)

        // SPA fallback (IN-4): only for navigations / extension-less paths; a missing /x.png stays 404.
        val last = segs.lastOrNull() ?: ""
        val accept = header(req, "Accept") ?: ""
        if (req.isForMainFrame || !last.contains('.') || accept.contains("text/html")) {
            val index = openAsset("$ROOT/index.html") ?: return error(404)
            return serveStream(index, "text/html", req)
        }
        return error(404)
    }

    private fun openAsset(path: String): InputStream? =
        try { assets.open(path, AssetManager.ACCESS_STREAMING) } catch (e: IOException) { null }

    private fun header(req: WebResourceRequest, name: String): String? =
        req.requestHeaders.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

    private fun servePluginFile(id: String, req: WebResourceRequest): WebResourceResponse {
        val (file, mime) = bridge.file(id) ?: return error(404)
        return try { serveStream(FileInputStream(file), mime, req, file.length()) } catch (e: IOException) { error(404) }
    }

    /** 200, or 206 for a single "bytes=a-b" range (IN-5). available() on an AssetInputStream is the
     *  remaining uncompressed length, so it works for compressed assets too. */
    private fun serveStream(stream: InputStream, mime: String, req: WebResourceRequest, knownLen: Long = -1): WebResourceResponse {
        val enc = if (mime.startsWith("text/") || mime == "application/json" || mime == "image/svg+xml") "utf-8" else null
        val range = if (activity.intent.getBooleanExtra("plainRange", false)) null else header(req, "Range")
        if (range == null) return WebResourceResponse(mime, enc, 200, "OK", baseHeaders(), stream)

        val total = if (knownLen >= 0) knownLen else stream.available().toLong()
        val m = Regex("""bytes=(\d*)-(\d*)""").matchEntire(range.trim())
        if (m == null || total <= 0) return WebResourceResponse(mime, enc, 200, "OK", baseHeaders(), stream)
        val (a, b) = m.destructured
        val start: Long; val end: Long
        if (a.isEmpty()) { start = maxOf(0, total - b.toLong()); end = total - 1 }     // suffix range
        else { start = a.toLong(); end = if (b.isEmpty()) total - 1 else minOf(b.toLong(), total - 1) }
        if (start > end || start >= total) {
            stream.close()
            return WebResourceResponse(mime, enc, 416, "Range Not Satisfiable", baseHeaders() + ("Content-Range" to "bytes */$total"), ByteArrayInputStream(ByteArray(0)))
        }
        // Do NOT skip: WebView's stream loader itself skips `start` bytes when the request has a Range
        // header (verified). We only cap the stream at end+1 and describe the range in the headers.
        val len = end - start + 1
        val headers = baseHeaders() + mapOf(
            "Accept-Ranges" to "bytes",
            "Content-Range" to "bytes $start-$end/$total",
            "Content-Length" to len.toString(),
        )
        return WebResourceResponse(mime, enc, 206, "Partial Content", headers, Limited(stream, end + 1))
    }

    private class Limited(s: InputStream, private var left: Long) : FilterInputStream(s) {
        override fun read(): Int = if (left <= 0) -1 else super.read().also { if (it >= 0) left-- }
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = super.read(b, off, minOf(len.toLong(), left).toInt())
            if (n > 0) left -= n
            return n
        }
        override fun available(): Int = minOf(super.available().toLong(), left).toInt()
        // WebView skips the range start through this method, so it must count against the cap.
        override fun skip(n: Long): Long = super.skip(minOf(n, left)).also { if (it > 0) left -= it }
    }

    private fun baseHeaders(): Map<String, String> = mapOf("Cache-Control" to "no-cache")

    private fun text(status: Int, mime: String, body: String) =
        WebResourceResponse(mime, "utf-8", status, REASON[status] ?: "OK", baseHeaders(), ByteArrayInputStream(body.toByteArray()))

    /** Non-200 needs the 6-arg constructor with a non-empty reason phrase (3xx is rejected outright). */
    private fun error(status: Int) = text(status, "text/plain", "$status ${REASON[status]}")

    private fun initJs(): String {
        val data = JSONObject()
            .put("v", 1)
            .put("platform", "android")
            .put("runtimeVersion", "0.0.0-proto")
            .put("env", JSONObject().put("PUBLIC_API_URL", "https://api.example.com").put("PUBLIC_TRICKY", "a b c </script> \"q\" \\ 한글 😀"))
            .put("plugins", bridge.pluginTable())
            .put("transport", bridge.transport)
        return "window.__AKAN_NATIVE__=${AkanNativeBridge.jsSafe(data.toString())};\n" + activity.assets.open("proto-transport.js").bufferedReader().readText()
    }

    // ── prototype-only: a second origin, to test iframe exposure of the bridge ──
    private fun otherOrigin(path: String): WebResourceResponse {
        val html = activity.assets.open("other-frame.html").bufferedReader().readText()
        return WebResourceResponse("text/html", "utf-8", 200, "OK", baseHeaders(), ByteArrayInputStream(html.toByteArray()))
    }
}
```

`AkanNativeFileProvider.kt`: AndroidX FileProvider 대체 (카메라 `EXTRA_OUTPUT` 대상)

```kotlin
package com.akanjs.proto

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.Log
import java.io.File
import java.io.FileNotFoundException

/**
 * Minimal replacement for androidx.core.content.FileProvider.
 * content://<pkg>.akan_native_files/capture/<name>  ↔  <cacheDir>/akan-native-capture/<name>
 * exported=false + grantUriPermissions=true: only an app handed a one-shot grant (Intent flags) can open it.
 */
class AkanNativeFileProvider : ContentProvider() {
    companion object {
        const val DIR = "akan-native-capture"
        private val NAME = Regex("[A-Za-z0-9_-][A-Za-z0-9._-]*")
        fun authority(ctx: Context) = ctx.packageName + ".akan_native_files"
        fun uriFor(ctx: Context, name: String): Uri = Uri.parse("content://${authority(ctx)}/capture/$name")
    }

    override fun onCreate(): Boolean = true

    private fun fileFor(uri: Uri): File {
        val segs = uri.pathSegments
        if (segs.size != 2 || segs[0] != "capture" || !NAME.matches(segs[1])) throw FileNotFoundException("bad uri $uri")
        return File(File(context!!.cacheDir, DIR), segs[1])
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        Log.i(TAG, "provider.openFile $uri mode=$mode caller=${callingPackage}")
        val f = fileFor(uri)
        f.parentFile?.mkdirs()
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode))
    }

    override fun getType(uri: Uri): String = "image/jpeg"

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor {
        val f = fileFor(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val row: List<Any?> = cols.map { c ->
            when (c) {
                OpenableColumns.DISPLAY_NAME -> f.name
                OpenableColumns.SIZE -> f.length()
                else -> null
            }
        }
        return MatrixCursor(cols, 1).apply { addRow(row.toTypedArray<Any?>()) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?): Int = 0
}
```

`Plugins.kt`: appState · preferences · keyboard · camera (+ 진단용 proto)

```kotlin
package com.akanjs.proto

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.util.Log
import android.view.WindowInsets
import android.view.inputmethod.InputMethodManager
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

// Stand-in for the generated AkanNativeGeneratedPlugins.kt (architecture §6): explicit list, no reflection.
fun registerPlugins(b: AkanNativeBridge) {
    b.register(AppStatePlugin(b))
    b.register(PreferencesPlugin(b))
    b.register(KeyboardPlugin(b))
    b.register(CameraPlugin(b))
    b.register(ProtoPlugin(b))
}

class AppStatePlugin(private val ctx: AkanNativePluginContext) : AkanNativePlugin {
    override val id = "appState"
    override val methods = listOf("getState")
    override fun call(method: String, args: JSONObject, call: AkanNativeCall) {
        call.resolve(JSONObject().put("state", ctx.activity.appState))
    }
}

/** usePreferences → SharedPreferences (capacitor-plugins/preferences does the same with group "CapacitorStorage"). */
class PreferencesPlugin(private val ctx: AkanNativePluginContext) : AkanNativePlugin {
    override val id = "preferences"
    override val methods = listOf("get", "set", "remove", "keys", "clear")
    private val prefs by lazy { ctx.activity.applicationContext.getSharedPreferences("akan-native.preferences", Context.MODE_PRIVATE) }
    override fun call(method: String, args: JSONObject, call: AkanNativeCall) {
        val key = args.optString("key")
        when (method) {
            "get" -> call.resolve(JSONObject().put("value", prefs.getString(key, null) ?: JSONObject.NULL))
            "set" -> { prefs.edit().putString(key, args.getString("value")).apply(); call.resolve() }
            "remove" -> { prefs.edit().remove(key).apply(); call.resolve() }
            "keys" -> call.resolve(JSONObject().put("keys", JSONArray(prefs.all.keys.toList())))
            "clear" -> { prefs.edit().clear().apply(); call.resolve() }
        }
    }
}

class KeyboardPlugin(private val ctx: AkanNativePluginContext) : AkanNativePlugin {
    override val id = "keyboard"
    override val methods = listOf("getState", "hide", "show")
    override fun call(method: String, args: JSONObject, call: AkanNativeCall) {
        val a = ctx.activity
        ctx.runOnMain {
            when (method) {
                "getState" -> call.resolve(a.lastInsets)
                "hide" -> {
                    // Either works; the WindowInsetsController variant is the API 30+ one.
                    val imm = a.getSystemService(InputMethodManager::class.java)
                    val ok = imm.hideSoftInputFromWindow(a.webView.windowToken, 0)
                    a.window.insetsController?.hide(WindowInsets.Type.ime())
                    call.resolve(JSONObject().put("imm", ok))
                }
                "show" -> { a.window.insetsController?.show(WindowInsets.Type.ime()); call.resolve() }
            }
        }
    }
}

/**
 * useCamera without androidx FileProvider: ACTION_IMAGE_CAPTURE writes into our own
 * ContentProvider (AkanNativeFileProvider) via a one-shot URI grant.
 * NOTE: if the manifest declares android.permission.CAMERA, ACTION_IMAGE_CAPTURE throws
 * SecurityException until it is granted.
 */
class CameraPlugin(private val ctx: AkanNativePluginContext) : AkanNativePlugin {
    override val id = "camera"
    override val methods = listOf("takePhoto", "pickPhoto")

    override fun call(method: String, args: JSONObject, call: AkanNativeCall) {
        val a = ctx.activity
        when (method) {
            "takePhoto" -> {
                val dir = File(a.cacheDir, AkanNativeFileProvider.DIR).apply { mkdirs() }
                val name = "IMG_${System.currentTimeMillis()}.jpg"
                val file = File(dir, name)
                val uri = AkanNativeFileProvider.uriFor(a, name)
                val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                intent.clipData = ClipData.newRawUri("output", uri)
                ctx.runOnMain {
                    try {
                        a.startForResult(intent) { code, _ ->
                            Log.i(TAG, "camera result=$code size=${file.length()}")
                            if (code == Activity.RESULT_OK && file.length() > 0) {
                                val url = ctx.registerFile(file, "image/jpeg")
                                call.resolve(JSONObject().put("url", url).put("mime", "image/jpeg").put("size", file.length()))
                            } else {
                                file.delete()
                                call.reject("CANCELLED", "capture cancelled")
                            }
                        }
                    } catch (e: ActivityNotFoundException) {
                        call.reject("UNSUPPORTED", "no camera app")
                    } catch (e: SecurityException) {
                        Log.w(TAG, "camera SecurityException: ${e.message}")
                        call.reject("PERMISSION_DENIED", e.message ?: "CAMERA permission")
                    }
                }
            }
            "pickPhoto" -> {
                // Photo Picker (framework, API 33+). No storage permission needed.
                val intent = Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
                ctx.runOnMain {
                    try {
                        a.startForResult(intent) { code, data ->
                            val src = data?.data
                            if (code != Activity.RESULT_OK || src == null) { call.reject("CANCELLED", "no selection"); return@startForResult }
                            val out = File(File(a.cacheDir, AkanNativeFileProvider.DIR).apply { mkdirs() }, "PICK_${System.currentTimeMillis()}")
                            a.contentResolver.openInputStream(src)!!.use { i -> out.outputStream().use { o -> i.copyTo(o) } }
                            val mime = a.contentResolver.getType(src) ?: "image/jpeg"
                            call.resolve(JSONObject().put("url", ctx.registerFile(out, mime)).put("mime", mime).put("size", out.length()))
                        }
                    } catch (e: ActivityNotFoundException) {
                        call.reject("UNSUPPORTED", "no photo picker")
                    }
                }
            }
        }
    }
}

/** Prototype diagnostics. */
class ProtoPlugin(private val ctx: AkanNativePluginContext) : AkanNativePlugin {
    override val id = "proto"
    override val methods = listOf("echo", "report", "insets", "probe", "reflect", "wrr")
    override fun call(method: String, args: JSONObject, call: AkanNativeCall) {
        when (method) {
            "echo" -> call.resolve(JSONObject().put("thread", Thread.currentThread().name).put("args", args))
            "report" -> { Log.i(TAG, "REPORT ${args.toString()}"); call.resolve() }
            "insets" -> call.resolve(ctx.activity.lastInsets)
            "wrr" -> {
                // Which WebResourceResponse status/reason combinations does the framework accept?
                val out = JSONObject()
                for ((code, reason) in listOf(200 to "OK", 204 to "No Content", 302 to "Found", 404 to "", 404 to "Not Found", 99 to "X", 600 to "X")) {
                    out.put("$code/'$reason'", try {
                        android.webkit.WebResourceResponse("text/plain", null, code, reason, null, null); "ok"
                    } catch (e: Throwable) { e.javaClass.simpleName + ": " + e.message })
                }
                call.resolve(out)
            }
            "reflect" -> {
                val names = android.webkit.WebView::class.java.methods.map { it.name }
                    .filter { it.contains("Message", true) || it.contains("DocumentStart", true) }.distinct().sorted()
                val glue = try {
                    Class.forName("org.chromium.support_lib_glue.SupportLibReflectionUtil", false, android.webkit.WebView.getWebViewClassLoader()).name
                } catch (e: Throwable) { "missing: $e" }
                call.resolve(JSONObject().put("sdk", android.os.Build.VERSION.SDK_INT).put("webViewMethods", JSONArray(names)).put("glue", glue))
            }
            "probe" -> ctx.runOnMain {
                // postWebMessage delivers only if the main frame's origin matches targetOrigin.
                val wv = ctx.activity.webView
                wv.postWebMessage(android.webkit.WebMessage("probe-wrong-origin"), Uri.parse("https://evil.localhost"))
                wv.postWebMessage(android.webkit.WebMessage("probe-app-origin"), Uri.parse(AkanNativeAssetServer.ORIGIN))
                wv.postWebMessage(android.webkit.WebMessage("probe-star"), Uri.parse("*"))
                call.resolve()
            }
        }
    }
}
```

### 2.9 JS 쪽 (전송 대역 + 측정 방법)

`assets/proto-transport.js`는 `init.js` 뒤에 붙어 나가며 `@akanjs/native/core` Android 전송의 대역이다. 핵심은 포트 수신 필터(`e.source === null`)와 `stopImmediatePropagation`이다.

```js
// Prototype stand-in for @akanjs/native/core's Android transport (not served under /: lives outside assets/app).
(function () {
  var O = window.__AKAN_NATIVE__;
  var seq = 0, pending = {}, listeners = {}, port = null, queue = [];
  O.receive = function (m) {
    if (m.id != null) {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.ok) p.resolve(m.result);
      else { var e = new Error(m.error.message); e.code = m.error.code; p.reject(e); }
    } else if (m.event) {
      (listeners[m.plugin + "/" + m.event] || []).forEach(function (cb) { cb(m.data); });
    }
  };
  function post(s) {
    if (O.transport !== "iface") { if (port) port.postMessage(s); else queue.push(s); }
    else window.__akan_nativeAndroid.postMessage(s);
  }
  O.call = function (plugin, method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      post(JSON.stringify({ v: 1, id: id, plugin: plugin, method: method, args: args }));
    });
  };
  O.on = function (plugin, event, cb) {
    var k = plugin + "/" + event;
    (listeners[k] = listeners[k] || []).push(cb);
    return O.call(plugin, "$listen", { event: event });
  };
  if (O.transport !== "iface") {
    O._portEvents = [];
    window.addEventListener("message", function (e) {
      if (e.data !== "akan-native:port") return;
      O._portEvents.push({ origin: e.origin, sourceNull: e.source === null, ports: e.ports.length, at: Math.round(performance.now()) });
      // Native postWebMessage → source === null. A spoofed port from an iframe has source = that window.
      if (e.source !== null || e.ports.length !== 1) return;
      e.stopImmediatePropagation();
      port = e.ports[0];
      port.onmessage = function (ev) { O.receive(JSON.parse(ev.data)); };
      O.portAt = Math.round(performance.now());
      queue.splice(0).forEach(function (s) { port.postMessage(s); });
    });
    // doorbell: native answers with postWebMessage(targetOrigin = app origin)
    if (O.transport === "port-fetch") fetch("/__akan_native/hello"); else window.__akan_nativeAndroid.hello();
  }
})();
```

insets 측정은 `env()`와 주입 변수를 padding으로 받는 숨은 div 두 개에 `getComputedStyle`을 적용하는 방식이다.
```css
#probe-env { position:absolute; visibility:hidden; padding: env(safe-area-inset-top,-1px) env(safe-area-inset-right,-1px) env(safe-area-inset-bottom,-1px) env(safe-area-inset-left,-1px); }
#probe-var { position:absolute; visibility:hidden; padding: var(--akan-native-safe-top,0) var(--akan-native-safe-right,0) var(--akan-native-safe-bottom,0) var(--akan-native-safe-left,0); }
```
교차 오리진 iframe 공격 페이지(`assets/other-frame.html`, `https://other.localhost/frame.html`로 서빙):
```html
<!doctype html><meta charset="utf-8"><body style="margin:0;font:10px monospace">
<script>
const rep = { frameOrigin: location.origin, hasIface: typeof window.__akan_nativeAndroid, hasAkanNative: typeof window.__AKAN_NATIVE__ };
try {
  if (window.__akan_nativeAndroid) {
    window.__akan_nativeAndroid.postMessage(JSON.stringify({ v: 1, id: 9001, plugin: "preferences", method: "set", args: { key: "pwned", value: "by-iframe" } }));
    rep.ifaceCallSent = true;
    window.__akan_nativeAndroid.hello();
  }
} catch (e) { rep.ifaceErr = String(e); }
fetch("https://app.localhost/__akan_native/hello", { mode: "no-cors" }).then(() => { rep.frameRang = true; }, (e) => { rep.frameRangErr = String(e); });
window.addEventListener("message", (e) => { if (e.data === "akan-native:port") rep.frameGotPort = true; });
const ch = new MessageChannel();
ch.port1.onmessage = (e) => { rep.spoofGot = String(e.data).slice(0, 120); };
parent.postMessage("akan-native:port", "*", [ch.port2]);   // try to hijack the parent's bridge
setTimeout(() => { parent.postMessage({ frameReport: rep }, "*"); document.body.textContent = JSON.stringify(rep); }, 2500);
</script>
```

### 2.10 설치·실행·확인 명령

```sh
A=$SDK/platform-tools/adb; E=$SDK/emulator/emulator
$E -list-avds                                                        # Medium_Phone, Pixel_10
$E -avd Pixel_10 -no-window -no-audio -no-boot-anim -no-snapshot-save &     # headless 부팅 (이번에는 16초)
$A wait-for-device; until [ "$($A shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 1; done
$A shell dumpsys webviewupdate | head -3                             # WebView 패키지·버전
$A install -r app.apk
$A shell am start -W -n com.akanjs.proto/.AkanNativeActivity                 # LaunchState, TotalTime
$A logcat -s AkanNativeProto:V AkanNativeConsole:V AndroidRuntime:E              # 네이티브 + JS console
$A exec-out screencap -p > shot.png
$A shell settings put secure show_ime_with_hard_keyboard 1           # 이 AVD는 hw.keyboard=yes라 이 설정 없이는 소프트 키보드가 뜨지 않는다
$A shell input tap 540 2300 ; $A shell input keyevent KEYCODE_BACK | KEYCODE_HOME | KEYCODE_ESCAPE
$A shell cmd uimode night yes|no                                     # 다크 모드 전환
$A shell pm grant|revoke com.akanjs.proto android.permission.CAMERA    # revoke하면 앱 프로세스가 죽는다
$A shell am kill com.akanjs.proto                                      # 백그라운드 프로세스 종료 (프로세스 사망 재현)
$A shell run-as com.akanjs.proto cat shared_prefs/akan-native.preferences.xml # debuggable APK에서만
$A shell cat /proc/net/unix | grep webview_devtools_remote           # devtools 소켓
$A shell cmd package query-activities -a android.media.action.IMAGE_CAPTURE   # → com.android.camera2/.CaptureActivity
$A shell am start -n com.akanjs.proto/.AkanNativeActivity --es js '<JS>'     # 프로토타입 자동화: onNewIntent → evaluateJavascript
```
camera2 조작: 셔터 `input tap 537 2261` → 확인(✓) `input tap 537 2265` (1080×2424 화면 기준).

### 2.11 검증 결과 (에뮬레이터 로그 발췌)

| 테스트 | 관찰값 |
|---|---|
| 오리진·보안 | `location.origin = https://app.localhost`, `isSecureContext = true` |
| MIME | svg `image/svg+xml`, json `application/json`, js `text/javascript` |
| 404 | `/__akan_native/nope` → `404 Not Found`(statusText가 전달된다), `/missing.png` → 404 |
| SPA | `/deep/route/x` → `200 text/html`, index.html 내용 |
| Range | `bytes=0-14` → 206 `bytes 0-14/8281`(15B) · `bytes=-10` → 206 `8271-8280/8281` · `bytes=20-` → 206 `20-22/23` · `bytes=8000-8009` → 10B · 범위를 벗어나면(`99999-`) fetch가 `TypeError: Failed to fetch`(416이 아니라 네트워크 에러) |
| 스레드 | `shouldInterceptRequest` = `ThreadPoolForeg`(동시에 여러 스레드) · `@JavascriptInterface` = `JavaBridge` · 포트 콜백 = `akan-native-plugins`(Handler를 지정한 스레드) |
| 브리지 왕복 (200회 평균) | 포트: debug 0.54~1.85ms, release/R8 0.08~0.99ms · JS 인터페이스 + eval: debug 1.06~1.82ms · 1MB echo: release/R8 16~24ms, debug 24~435ms |
| 첫 호출 | 0.3ms~309ms로 들쭉날쭉하다(시작 직후 경합으로 보이며 원인은 미조사). 변형과 무관하게 나타났다 |
| 문자열 안전성 | `a b c </script> '"\` ${x} 한글 😀 \\`가 init.js env와 echo 양쪽에서 정확히 왕복했다 |
| 포트 전달 | 네이티브가 보낸 포트는 `origin: ""`, `source === null`로 도착(탐색 시작 후 121~169ms). iframe이 보낸 위조 포트는 `origin: https://other.localhost`, `source ≠ null` → 걸러졌다 |
| `postWebMessage` 오리진 | `https://evil.localhost` 대상은 전달되지 않았다(콘솔: *target origin ... does not match the recipient window's origin*). 앱 오리진·`*` 대상은 전달됐다 |
| iframe 노출 | JS 인터페이스 방식: iframe `typeof __akan_nativeAndroid === "object"`, iframe이 `preferences.set` 성공(`pwned=by-iframe`이 xml에 저장됨). fetch 알림 방식: `"undefined"`, iframe의 알림은 무시됨, `pwned = null` |
| `shouldOverrideUrlLoading` | 외부 링크 탭(main=true, gesture=true) → `ACTION_VIEW` → Chrome이 열렸다. **iframe `src` 로드에서는 한 번도 불리지 않았다** |
| 요청 헤더 | User-Agent, sec-ch-ua*, Accept, Referer, Range, 문서 요청에만 `Upgrade-Insecure-Requests=1`. **Origin·Sec-Fetch-*는 없다** |
| safe area | 네이티브 systemBars+cutout = top 54.095dp, bottom 24dp · `env()` = `55px 0 24px 0` · 주입 변수 = `54.0952px 0 24px 0` · dpr 2.625 · viewport-fit 없음 → 0 |
| IME "pad" | 키보드 312.38dp(ime.bottom 336.38 − 내비게이션 바 24) · `innerHeight` 923→587 · 고정 입력창 867→555(키보드 위) · env bottom 24→0 · `willShow`(285ms) 후 `change` |
| IME "none" | `innerHeight` 923 그대로, `visualViewport` 587@offsetTop 336(화면이 밀려 올라가 포커스된 입력창은 보인다) · env bottom → 0(WebView가 직접 처리) |
| `interactive-widget=resizes-content` | 정적 meta, 동적 변경 모두 **무시됐다**(`innerHeight` 923 유지) |
| 키보드 숨기기 | `hideSoftInputFromWindow` → `willHide` → `change {visible:false}`, `mInputShown=false` |
| 앱 상태 | HOME: inactive → background · 재실행: active · 권한 대화상자: inactive만 · `onNewIntent`: inactive → active |
| 뒤로가기 | 탭으로 `pushState` → `canGoBack=true` → back → `goBack()` → popstate "/" · 루트에서 back → 런처로 나감(프로세스는 유지) · `evaluateJavascript`로 `pushState` → `canGoBack=false` → back하면 바로 앱을 떠남 |
| 다크 모드 | `cmd uimode night yes` → `onConfigurationChanged` → `matchMedia` change `true`, 화면이 어둡게 바뀜 · 다크 모드에서 콜드 스타트하면 `dark: true` |
| 카메라 (CAMERA 미선언) | camera2 `CaptureActivity`가 실행됨 → `provider.openFile(... mode=w) caller=com.android.camera2` → `RESULT_OK`, 63,028B → `/__akan_native/file/f1` → `<img>` 1440×1920 |
| 카메라 (CAMERA 선언, 미허용) | `SecurityException: Permission Denial: starting Intent { act=android.media.action.IMAGE_CAPTURE ... } with revoked permission android.permission.CAMERA` → `PERMISSION_DENIED` |
| getUserMedia | 허용 상태: `onPermissionRequest [VIDEO_CAPTURE]` → grant → `camera 0, facing front` 트랙 · 미허용: 시스템 권한 대화상자 → 거부 → `NotAllowedError` |
| Photo Picker | `ACTION_PICK_IMAGES` → `com.google.android.photopicker` · 취소 → `RESULT_CANCELED` → `CANCELLED` (사진이 없는 에뮬레이터라 선택 경로는 미검증) |
| 프로세스 사망 | 카메라 화면에서 `am kill` → 촬영 → 새 프로세스에서 provider `openFile` 성공 → 액티비티를 다시 만들고 `onActivityResult(req=1000, RESULT_OK)`가 도착하지만 콜백이 없어 결과가 버려짐 · 페이지는 새로 로드됨 |
| devtools | debuggable + 미호출 → 소켓 있음 · non-debuggable + 미호출 → 없음 · non-debuggable + 호출 → 있음 |
| API 37 리플렉션 | `WebView` 메서드 중 Message/DocumentStart 관련은 `createWebMessageChannel`, `postWebMessage`뿐 · WebView APK에 `org.chromium.support_lib_glue.SupportLibReflectionUtil`(AndroidX webkit이 붙는 내부 glue)이 있다 |

기타 관찰
- 에뮬레이터를 콜드 부팅한 직후 첫 실행에서 한 번, Blink `font_unique_name_lookup_android.cc: Received platform font handle invalid` 로그와 함께 **10초** 멈춤이 있었다. 이후 재설치를 해도 재현되지 않았다. CI에서는 부팅 후 잠시 기다린다.
- 문서가 생기기 전에 `evaluateJavascript`를 부르면 `document.documentElement`가 null이라 예외가 났다. insets를 주입하는 JS는 이 경우를 검사하고, `onPageFinished`에서 `requestApplyInsets()`를 불러 다시 주입한다.
- viewport-fit=cover가 없는 페이지에서 키보드를 띄운 뒤 env top이 0에서 55px로 바뀌었다(`iw.html`). WebView의 특이 동작으로 보이며, akan-native는 cover를 기본으로 권장한다.

## 3. 참고 코드 노하우

경로는 이 문서 위치 기준이다. Capacitor `145560e`, capacitor-plugins `03fca06`, react-native `b71d466`, wry `547382d`.

**에셋 서빙 (Capacitor `WebViewLocalServer`, WRY)**
- [WebViewLocalServer.java#L184-L216](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L184-L216): 호스트 매칭 → 로컬(assets) 또는 프록시. 기본 오리진은 `https://localhost`다([CapConfig.java#L38-L39](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/CapConfig.java#L38-L39)). akan-native는 `app.localhost`를 쓴다.
- [#L218-L234](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L218-L234): `isForMainFrame`은 iframe과 fetch를 구분하지 못하므로, **문서 요청은 `Upgrade-Insecure-Requests` 헤더로 판별한다.** 이번 검증에서 본 헤더와 일치한다.
- [#L254-L288](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L254-L288): 상태 코드별 reason phrase 표. `WebResourceResponse`는 reason이 비어 있으면 안 된다. WRY는 추가로 **상태 코드가 100 미만·599 초과·300~399이면 응답을 포기한다**([binding.rs#L190-L207](../../../wry/src/android/binding.rs#L190-L207)). 리다이렉트는 표현할 수 없다.
- [#L365-L398](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L365-L398): Range 요청에 206 + `Content-Range`를 주면서 **스트림은 건너뛰지 않는다.** WebView가 skip한다는 전제이고, 이번 검증으로 그 이유가 확인됐다. 다만 end를 자르지 않아 `a-b` 범위에서는 끝까지 보낸다. akan-native는 end+1 캡을 둔다.
- [#L425-L458](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L425-L458): html5mode SPA 폴백 = `/` 또는 마지막 세그먼트에 `.`이 없으면 index.html.
- [#L573-L594](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L573-L594): `URLConnection.guessContentTypeFromName`은 `.js`를 모른다는 주석이 있어서 `.js/.mjs/.wasm`을 수동으로 처리한다. akan-native는 자체 MIME 표를 쓰고, 없으면 `MimeTypeMap`으로 넘긴다.
- [#L596-L606](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L596-L606) · [#L726-L794](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L726-L794): 스트림을 지연해서 여는 방식(WebView IO 스레드에서 연다)과 `available() == -1`이면 404로 처리하는 방식.
- [#L99-L106](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java#L99-L106): 기본 헤더는 `Cache-Control: no-cache`. WRY는 `no-store`를 쓴다([RustWebViewClient.kt#L41-L55](../../../wry/src/android/kotlin/RustWebViewClient.kt#L41-L55)).
- [binding.rs#L232-L247](../../../wry/src/android/binding.rs#L232-L247): Content-Type과 Content-Length는 `WebResourceResponse`가 만드므로 헤더 맵에서 뺀다. akan-native의 206에 넣은 `Content-Length`는 문제없이 동작했다.
- [RustWebViewClient.kt#L21-L26](../../../wry/src/android/kotlin/RustWebViewClient.kt#L21-L26): WRY는 AndroidX `WebViewAssetLoader`를 쓴다. akan-native에서는 쓸 수 없으므로 직접 구현한다(§2.8).
- [Bridge.java#L283-L293](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L283-L293): Service Worker 요청은 `WebViewClient`를 거치지 않는다. 프레임워크 `ServiceWorkerController.setServiceWorkerClient`(API 24)로 가로챈다 [코드].

**브리지**
- [MessageHandler.java#L26-L42](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/MessageHandler.java#L26-L42): AndroidX `WebViewCompat.addWebMessageListener(webView, "androidBridge", allowedOriginRules, …)` + `isMainFrame` 검사. 지원되지 않으면 `addJavascriptInterface`로 폴백한다. 오리진 목록은 [Bridge.java#L236-L255](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L236-L255)에서 만든다. **akan-native는 AndroidX를 못 쓰므로 MessagePort가 이 역할을 대신한다.**
- [MessageHandler.java#L121-L145](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/MessageHandler.java#L121-L145): 응답은 `replyProxy.postMessage` 또는 `webView.post { evaluateJavascript("window.Capacitor.fromNative(json)") }`로 보낸다. 콜백이 없는(dangling) 호출은 `fireRestoredResult`로 넘긴다.
- [Bridge.java#L215-L217](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L215-L217) · [#L822-L865](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L822-L865): 플러그인 호출은 `HandlerThread("CapacitorPlugins")` 하나에서 직렬로 실행한다. [#L874-L877](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L874-L877): eval은 main Looper에서 한다.
- [Bridge.java#L264-L274](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L264-L274): 문서 시작 스크립트는 AndroidX `addDocumentStartJavaScript`로 넣고, 없으면 HTML 스트림을 고쳐 쓴다(JSInjector). akan-native는 `<script src="/__akan_native/init.js">` 방식이라 둘 다 필요 없다.
- [Ipc.kt#L11-L20](../../../wry/src/android/kotlin/Ipc.kt#L11-L20): WRY는 `@JavascriptInterface postMessage`에 `onPageStarted`에서 추적한 `currentUrl`을 붙여 보낸다. 호출한 **프레임**은 알 수 없다(iframe 문제는 그대로 남는다).

**WebView 설정·클라이언트**
- [Bridge.java#L587-L624](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L587-L624): JS·DOM storage를 켜고, 배경색은 `webView.setBackgroundColor`, `setWebContentsDebuggingEnabled`은 설정값을 따른다. Capacitor는 `setJavaScriptCanOpenWindowsAutomatically(true)`와 geolocation을 켜지만 akan-native는 끈다. WRY도 비슷하다([RustWebView.kt#L21-L26](../../../wry/src/android/kotlin/RustWebView.kt#L21-L26)).
- [Bridge.java#L389-L427](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L389-L427): 앱 호스트가 아니면 `Intent.ACTION_VIEW`로 보내고 `true`를 반환한다. `data:`·`blob:`은 허용한다.
- [BridgeWebViewClient.java#L92-L104](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java#L92-L104): `onRenderProcessGone`. false를 반환하면 앱이 죽으므로 akan-native는 true를 반환하고 WebView를 다시 만든다.
- [BridgeWebChromeClient.java#L426-L448](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java#L426-L448): console → Logcat(레벨 매핑).
- [BridgeWebChromeClient.java#L102-L124](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java#L102-L124) · [RustWebChromeClient.kt#L60-L115](../../../wry/src/android/kotlin/RustWebChromeClient.kt#L60-L115): `VIDEO_CAPTURE`는 CAMERA에, `AUDIO_CAPTURE`는 RECORD_AUDIO + MODIFY_AUDIO_SETTINGS에 대응시켜 런타임 권한을 받은 뒤 grant한다. akan-native는 요청 오리진도 검사한다(§2.8).
- [BridgeWebChromeClient.java#L276-L313](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java#L276-L313) · [#L375-L406](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java#L375-L406): `<input type=file capture>`이면 카메라 intent, 아니면 `FileChooserParams.createIntent()` + `parseResult`. **CAMERA가 선언돼 있고 아직 허용되지 않았으면 먼저 권한을 요청한다**([#L307-L313](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java#L307-L313)). 이번 SecurityException 검증과 같은 이유다.
- [android-template AndroidManifest.xml#L12-L18](../../../capacitor/android-template/app/src/main/AndroidManifest.xml#L12-L18): `configChanges` 목록과 `launchMode="singleTask"`.

**Insets·키보드**
- [SystemBars.java#L38-L41](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L38-L41): WebView 140부터 safe-area를 지원하고(crbug 40699457), 144부터 키보드 표시 중 bottom 버그가 고쳐졌다(crbug 457682720). 버전은 AndroidX `WebViewCompat.getCurrentWebViewPackage`로 구한다([#L343-L351](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L343-L351)). 프레임워크 `WebView.getCurrentWebViewPackage()`(API 26)로도 같은 값을 얻는다 [검증].
- [SystemBars.java#L43-L54](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L43-L54) · [#L94-L101](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L94-L101): `onPageCommitVisible`에서 meta viewport에 `viewport-fit=cover`가 있는지 보고 `requestApplyInsets()`를 부른다.
- [SystemBars.java#L186-L240](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L186-L240): cover면 insets를 그대로 넘기고 IME 높이만 padding으로 준다. cover가 아니면 시스템 바만큼 padding을 주고 insets를 0으로 만들어 넘긴다. **`CONSUMED`를 반환하면 이후 insets 재계산이 깨진다**는 주석이 있다(crbug 461332423). 그래서 akan-native도 insets를 소비하지 않고 수정한 객체를 넘긴다.
- [SystemBars.java#L242-L281](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L242-L281): `--safe-area-inset-*` CSS 변수를 px(=dp) 단위로 주입한다. 키보드가 떠 있으면 bottom은 0이다.
- [ReactRootView.java#L937-L986](../../../react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/ReactRootView.java#L937-L986): 키보드 높이 = `ime.bottom − systemBars.bottom`. 표시 중에 높이가 바뀌어도(이모지 패널 등) 다시 알린다. akan-native의 `height`도 같은 정의다.
- [WindowUtil.kt#L166-L210](../../../react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/WindowUtil.kt#L166-L210): edge-to-edge를 켜는 절차(투명 바, contrast 끄기, cutout ALWAYS). targetSdk 35+에서는 시스템이 강제하므로 akan-native는 따로 하지 않아도 된다. 실제로 이번 앱은 추가 코드 없이 edge-to-edge였다 [검증].

**수명주기·뒤로가기**
- [AppStateModule.kt#L42-L59](../../../react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/appstate/AppStateModule.kt#L42-L59): RN은 resume = active, pause = background의 2단계이고 포커스는 별도 이벤트다. akan-native는 3단계다(pause = inactive, stop = background).
- [BridgeActivity.java#L93-L124](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java#L93-L124): Capacitor는 resume에 active, stop(activityDepth가 0일 때)에 inactive를 보내고, pause는 별도 이벤트로 보낸다([AppPlugin.java#L158-L170](../../../capacitor-plugins/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java#L158-L170)).
- [AppPlugin.java#L36-L62](../../../capacitor-plugins/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java#L36-L62) · [WryActivity.kt#L56-L70](../../../wry/src/android/kotlin/WryActivity.kt#L56-L70): 둘 다 AndroidX `OnBackPressedCallback`을 쓴다. 리스너가 없으면 `canGoBack ? goBack : 기본 동작`이고, 리스너가 있으면 JS로 이벤트(`canGoBack`)만 보낸다. akan-native는 프레임워크 `OnBackInvokedDispatcher`(API 33)로 같은 일을 한다.
- [Bridge.java#L1058-L1110](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java#L1058-L1110) · [AppPlugin.java#L42-L45](../../../capacitor-plugins/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java#L42-L45): 마지막 activity-result 호출(플러그인 id, 메서드, 옵션)을 `onSaveInstanceState`에 저장한다. 프로세스가 죽었다 살아나면 결과를 `appRestoredResult` 이벤트로 보낸다.

**카메라·파일·Preferences**
- [CameraPlugin.java#L299-L321](../../../capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraPlugin.java#L299-L321): `ACTION_IMAGE_CAPTURE` + `FileProvider.getUriForFile(appId + ".fileprovider")`로 `EXTRA_OUTPUT`을 넘긴다. 파일은 `getExternalFilesDir(DIRECTORY_PICTURES)`에 만든다([CameraUtils.java#L20-L29](../../../capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraUtils.java#L20-L29)). provider는 템플릿이 선언한다([android-template AndroidManifest.xml#L27-L35](../../../capacitor/android-template/app/src/main/AndroidManifest.xml#L27-L35), [file_paths.xml](../../../capacitor/android-template/app/src/main/res/xml/file_paths.xml)). akan-native는 `cacheDir/akan-native-capture` + 자체 provider로 바꾼다.
- [CameraPlugin.java#L200-L235](../../../capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraPlugin.java#L200-L235) · [#L808-L815](../../../capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraPlugin.java#L808-L815): "CAMERA가 매니페스트에 없으면 권한이 필요 없으므로 granted로 보고한다." akan-native의 `checkPermission`도 같게 한다.
- [camera AndroidManifest.xml#L2-L6](../../../capacitor-plugins/camera/android/src/main/AndroidManifest.xml#L2-L6): `resolveActivity`를 쓰기 때문에 `<queries>`가 필요하다. akan-native는 `startActivity` + `ActivityNotFoundException` 방식이라 필요 없다.
- [CameraPlugin.java#L403-L422](../../../capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraPlugin.java#L403-L422): 결과를 받으면 파일을 디코드하고, 실패하면 "사용자 취소"로 본다. akan-native는 `RESULT_OK && file.length() > 0`으로 판단한다.
- [Preferences.java#L16-L44](../../../capacitor-plugins/preferences/android/src/main/java/com/capacitorjs/plugins/preferences/Preferences.java#L16-L44): `getSharedPreferences(group, MODE_PRIVATE)`, 쓰기는 `apply()`. 기본 group은 `"CapacitorStorage"`다([PreferencesConfiguration.java#L9](../../../capacitor-plugins/preferences/android/src/main/java/com/capacitorjs/plugins/preferences/PreferencesConfiguration.java#L9)).

## 4. akan-native 설계에 반영할 점 / 아키텍처 문서와 달라져야 할 점

### 4.1 브리지: JS 인터페이스를 MessagePort로 교체 (§3.5, §4 표, SEC-1)

근거: iframe이 JS 인터페이스로 실제 쓰기를 했다. iframe 로드는 `shouldOverrideUrlLoading`을 거치지 않는다. 프레임워크에 `addWebMessageListener`가 없다. MessagePort 방식은 세 가지를 모두 해결했다(§2.11).

```
JS (@akanjs/native/core, init.js 직후 가장 먼저)                     Kotlin (셸)
───────────────────────────────────────────                 ─────────────────────────────────────────────
addEventListener("message", onPort)   ← 첫 리스너
fetch("/__akan_native/hello")  ─────────────────────────────────►  shouldInterceptRequest: 204 No Content
                                                            runOnUiThread { if (!offered) {
                                                              offered = true
                                                              [p0, p1] = createWebMessageChannel()
                                                              p0.setWebMessageCallback(cb, pluginHandler)
                                                              postWebMessage(WebMessage("akan-native:port", [p1]),
                                                                             Uri.parse("https://app.localhost")) } }
onPort(e): data === "akan-native:port" && e.source === null
           && e.ports.length === 1 → stopImmediatePropagation,
           port = e.ports[0], 대기열 비우기
요청: port.postMessage(JSON 텍스트) ────────────────────►  cb.onMessage (plugin Handler 스레드에서 바로)
응답·이벤트: port.onmessage ◄──────────────────────────  p0.postMessage(WebMessage(json))  (어느 스레드든 가능)
                                                            onPageStarted: p0.close(), offered = false, 구독 초기화
```
- §4 표의 Android 행: `JS → 호스트: MessagePort.postMessage(json)`(포트는 `postWebMessage`로 받음) · `응답: 같은 포트` · `이벤트: 같은 포트`. `evaluateJavascript`는 브리지에 쓰지 않는다(insets 폴백 주입에만 쓴다).
- `/__akan_native/hello`를 §5 예약 경로에 추가한다(Android 전용, 204). JS 인터페이스 `hello()`도 동작했지만(검증), fetch 방식이면 **주입 객체가 0개**다. `addJavascriptInterface`를 부르지 않는다.
- `@akanjs/native/core`의 `runtime.ts` `case "android"`(현재 `__akan_nativeAndroid.postMessage` 사용)를 바꾼다. 포트가 올 때까지 요청을 대기열에 둔다(이번에는 탐색 시작 후 121~169ms에 도착). `postMessage`는 JSON 텍스트만 보낸다. 프레임워크 `WebMessage`는 문자열만 담을 수 있다.
- 포트 제공은 문서마다 한 번이다. iframe이 먼저 알리는 일은 사실상 없다(iframe은 init.js 뒤에 생긴다). 그래도 알림이 여러 번 오면 무시한다. 다시 만들면 진행 중인 호출이 끊어진다.
- 요구사항 SEC-1의 "Android는 이동 허용 목록으로 막는다"를 "Android는 앱 오리진 메인 프레임에만 MessagePort를 준다(`postWebMessage` targetOrigin)"로 바꾼다. 메인 프레임 이동 허용 목록(`shouldOverrideUrlLoading`)은 SH-4 용도로 그대로 둔다.
- (선택) 서브프레임 차단: `!isForMainFrame && Upgrade-Insecure-Requests`인 요청은 문서 요청이다. 외부 오리진 문서를 `shouldInterceptRequest`에서 403으로 막을 수 있다 [추론]. 브리지가 안전해지므로 MVP에서는 필요 없다.
- AndroidX webkit이 쓰는 WebView 내부 glue(`SupportLibReflectionUtil`)가 WebView APK에 있다. 리플렉션으로 `addWebMessageListener`를 직접 부를 수도 있지만, AndroidX 내부를 다시 구현하는 일이라 취약하고 원칙에도 어긋난다. 쓰지 않는다.

### 4.2 에셋 서빙 규칙 보완 (§5)

- **SPA 폴백 범위**: "나머지 → index.html" 대신 **문서 요청**(`isForMainFrame` 또는 `Upgrade-Insecure-Requests` 헤더)과 확장자가 없는 경로에만 index.html을 준다. `/missing.png`나 사라진 JS 청크는 404로 둔다. 그래야 "Unexpected token <" 같은 혼란이 없다. 헤더는 Referer·Accept 정도만 오고 `Sec-Fetch-*`는 없다(검증). 다른 플랫폼 호스트도 같은 규칙을 쓰도록 명세에 적는다.
- `WebResourceResponse` 제약 [검증]: 6인자 생성자에 빈 reason을 주면 `IllegalArgumentException: reasonPhrase can't be empty.`, 302는 `statusCode can't be in the [300, 399] range.`, 99/600도 예외다. 204·404는 된다. **리다이렉트는 표현할 수 없다.** Content-Type은 헤더가 아니라 `mimeType`/`encoding` 인자로 준다.
- **Range (IN-5)**: 206, `Content-Range: bytes a-b/total`, `Accept-Ranges`, `Content-Length`를 주고, 스트림은 **건너뛰지 않은 원본을 end+1에서 자르고 `skip()`도 캡에 포함**한다(§2.8 `Limited`). WebView는 suffix range(`-N`)의 시작을 `available()`로 계산한다. 그래서 `available()`이 전체 길이를 돌려줘야 한다. `AssetManager.open()`은 압축된 asset에서도 그렇게 동작했다. 범위를 벗어나면 416을 줘도 fetch는 네트워크 에러가 된다.
- MIME은 셸의 고정 표를 먼저 보고 없으면 `MimeTypeMap`을 쓴다. 텍스트 계열은 encoding `utf-8`.
- 경로는 `Uri.getPathSegments()`(디코드된 값)로 만들고, `..`·`.`·NUL 세그먼트는 400. `/`로 끝나면 `index.html`.
- `Cache-Control: no-cache`. GET/HEAD 외에는 405.
- `/__akan_native/file/<id>`는 등록된 `File`을 같은 Range 규칙으로 서빙한다(검증: 카메라 사진).
- SPA가 Service Worker를 쓰면 `ServiceWorkerController.getInstance().setServiceWorkerClient(...)`로 같은 서버를 연결한다 [코드, 미검증].

### 4.3 플러그인 규격·컨텍스트 (§6)

- **camera android 항목에서 `permissions: ["android.permission.CAMERA"]`를 뺀다.** 선언하는 순간 intent 방식이 권한을 요구한다(검증). CAMERA는 WebView `getUserMedia`를 쓰는 플러그인만 선언한다. 선언하지 않았으면 `checkPermission` → `granted`.
- 셸이 `AkanNativeFileProvider`를 소유한다. 생성하는 매니페스트에 `<provider android:name="…AkanNativeFileProvider" android:authorities="<appId>.akan-native.files" android:exported="false" android:grantUriPermissions="true"/>`를 넣는다. 플러그인 컨텍스트에 `createCaptureTarget(name): Pair<File, Uri>`와 `registerFile(file, mime): String`을 둔다. `EXTRA_OUTPUT` + `FLAG_GRANT_WRITE_URI_PERMISSION|FLAG_GRANT_READ_URI_PERMISSION` + `ClipData.newRawUri`.
- `AkanNativePluginContext` 초안(검증한 형태): `activity`, `emit(plugin, event, data)`, `registerFile`, `runOnMain`, `startActivityForResult(intent, cb)`(프레임워크 `Activity.startActivityForResult` + 요청 코드 맵 + `onActivityResult`), `requestPermissions(perms, cb)`(`Activity.requestPermissions` + `onRequestPermissionsResult`). AndroidX ActivityResult API는 쓰지 않는다. 프레임워크 `Activity.onActivityResult(int,int,Intent)`는 deprecated가 아니다(API 36에는 `ComponentCaller` 오버로드가 추가됐다).
- **프로세스 사망 복원**: 진행 중인 activity-result 호출을 `onSaveInstanceState`에 저장한다(플러그인 id, 메서드, 캡처 파일 경로). 새 프로세스에서 결과가 오면 페이지가 로드된 뒤 이벤트(예: `app-state` 또는 `camera`의 `restoredResult`)로 보낸다. Capacitor와 같은 방식이다. MVP에서는 최소한 결과 파일을 지우지 않고 로그만 남겨도 된다.
- 플러그인 호출은 `HandlerThread("akan-native-plugins")` 하나에서 직렬로 실행한다. MessagePort 콜백도 이 Handler로 바로 온다. UI 작업은 `runOnMain`으로 넘긴다. 오래 걸리는 작업은 플러그인이 자기 스레드로 옮긴다.
- 카메라 옵션: `direction: "front"`에 해당하는 공식 intent extra는 없다. 비공식 extra(`android.intent.extras.CAMERA_FACING=1`, `android.intent.extras.LENS_FACING_FRONT=1`, `android.intent.extra.USE_FRONT_CAMERA=true`)를 넣어 보는 정도다 [추론, 미검증]. `quality`는 카메라 앱이 인코딩하므로 필요하면 `Bitmap.compress`로 다시 인코딩한다. `width/height`는 `BitmapFactory.Options.inJustDecodeBounds`와 `android.media.ExifInterface` 방향으로 구한다 [추론]. `source: "library"`는 `MediaStore.ACTION_PICK_IMAGES`를 쓰고, 결과 URI를 캐시로 복사한 뒤 `registerFile`한다.
- 키보드 `height` 정의: `ime.bottom − systemBars.bottom`(dp = CSS px). 셸이 "pad" 모드로 WebView를 줄이면 페이지를 가리는 부분은 0이 되지만 값은 그대로 알린다. 문서의 "covers the bottom of the page" 표현을 "키보드 높이(내비게이션 바 제외)"로 고친다.

### 4.4 빌드 파이프라인 (§8)

| 단계 | Android 제안 |
|---|---|
| 2. 생성 | `AndroidManifest.xml`(권한 합치기, provider, `configChanges`, 테마), `AkanNativeGeneratedPlugins.kt`, (선택) `res/values*/akan-native.xml`(배경색) |
| 3. 컴파일 | `kotlinc -no-jdk -no-stdlib -no-reflect -jvm-target 17 -classpath android.jar:kotlin-stdlib.jar`. **셸과 플러그인 소스의 해시로 `classes.jar`/dex를 캐시**한다. HTML·env만 바뀌면 Kotlin 컴파일 없이 1초 안에 끝난다 [추론] |
| 3. dex | dev: 캐시한 stdlib dex(`classes2.dex`) + 앱만 `d8 --debug`(0.5s). release: R8(`-dontwarn org.jetbrains.annotations.**`, keep 규칙). R8이 1.9초라 dev에서 써도 된다 |
| 4. 패키징 | `aapt2 link --manifest … -I android.jar [res.zip] --min/target-sdk … [--debug-mode]` → **Bun APK 조립기**(dex STORED, assets, 4바이트 정렬). `zip`·`zipalign`은 필요 없다(테스트에서만 `zipalign -c`) |
| 5. 서명 | `apksigner sign --v1-signing-enabled false --ks ~/.akan/native/debug.keystore ...`(키가 없으면 §2.3의 keytool로 만든다) |
| 6. 실행 | `emulator -avd <name> -no-window|… &` → `adb wait-for-device` + `sys.boot_completed` → `adb install -r` → `am start -W -n <appId>/.AkanNativeActivity` → `logcat -s AkanNative:V AkanNativeConsole:V` (WV-3) |

- `akan-native doctor`: build-tools에 `lib/d8.jar`(R8 포함)가 있는지 추가로 확인한다. kotlinc를 도는 JRE와 JDK 버전은 달라도 된다(이번에는 JRE 27 + JDK 21).
- env(`env.runtime.json`) 교체 패키징(ENV-4)은 assets 교체 → Bun 조립 → 서명만 다시 하면 된다.

### 4.5 셸 기본값 (§3.5 보완)

- `android.app.Activity` + `launchMode="singleTask"` + §2.2의 `configChanges` + `windowSoftInputMode="adjustResize"`(IME insets·애니메이션 콜백을 받기 위한 설정으로 알려져 있다. adjustResize일 때 동작하는 것만 확인했고, 다른 모드는 시험하지 않았다 [추론]).
- 테마: MVP는 `Theme.DeviceDefault.DayNight` + `FEATURE_NO_TITLE` + 코드에서 창·WebView 배경색(SH-3). 스플래시 색까지 맞추려면 `res/values`를 생성하는 방식(§2.6)으로 간다. 아이콘(CLI-8)도 결국 res가 필요하므로 `aapt2 compile` 단계는 이후에 어차피 생긴다.
- WebSettings: `javaScriptEnabled`, `domStorageEnabled`, `allowFileAccess=false`, `allowContentAccess=false`, `mixedContentMode=NEVER_ALLOW`, `setSupportMultipleWindows(false)`, `javaScriptCanOpenWindowsAutomatically=false`, `isAlgorithmicDarkeningAllowed=false`, `setSupportZoom(false)`. `setWebContentsDebuggingEnabled(true)`는 dev 빌드에서만 부른다(debuggable이면 자동이지만 명시해 둔다).
- WebViewClient: `shouldInterceptRequest`(§4.2), `shouldOverrideUrlLoading`(앱 오리진이면 false, 메인 프레임의 외부 URL은 `ACTION_VIEW` + `CATEGORY_BROWSABLE` 후 true), `onPageStarted`(포트·구독 초기화), `onPageFinished`(`requestApplyInsets`), `doUpdateVisitedHistory`(뒤로가기 콜백 갱신은 `post`로 한 턴 미룬다), `onRenderProcessGone`(true를 반환하고 WebView를 다시 만든다).
- WebChromeClient: `onConsoleMessage` → `Log.println(level, "AkanNativeConsole", …)`. `onPermissionRequest`는 앱 오리진이고 요청 권한이 매니페스트에 있을 때만 허용한다. `onShowFileChooser`는 `params.createIntent()` + `FileChooserParams.parseResult`. 이게 없으면 web 구현의 `<input type=file>`이 Android에서 아무 동작도 하지 않는다.
- Insets(Q6): `root.setOnApplyWindowInsetsListener`에서 `systemBars()|displayCutout()`와 `ime()`를 읽는다. **insets를 소비하지 않는다.** "pad" 모드에서는 IME 표시 중 `padding-bottom = ime.bottom`을 주고 bottom 바 inset을 0으로 바꾼 insets를 자식에게 넘긴다. `WebView.getCurrentWebViewPackage().versionName`의 주 버전이 140 미만이면 `--akan-native-safe-area-*` CSS 변수를 주입한다. 앱 CSS 가이드는 `padding-top: var(--akan-native-safe-area-top, env(safe-area-inset-top))` 형태로 쓴다. 이 폴백 형태는 아직 적용해 보지 않았다 [추론].
- 키보드 모드: 기본은 "resize"(pad). 설정으로 "pan"(WebView 기본 = resizes-visual)을 고를 수 있게 한다. `interactive-widget` meta는 WebView가 무시한다.
- 앱 상태: resume → active, pause → inactive, stop → background. `onNewIntent`가 일으키는 inactive → active 전환은 걸러내지 않는다(실제 상태 전환이다).
- 뒤로가기(SH-5): 기본은 `canGoBack`일 때만 `OnBackInvokedCallback`을 등록하고 `goBack()`한다. JS가 `backButton`을 구독하면 항상 등록하고 이벤트만 보내는 방식으로 확장한다(Capacitor와 같음). 이 경우 루트에서 앱을 나가는 동작은 JS가 `app.exit()`/`moveTaskToBack` 등으로 직접 처리해야 한다.

## 5. 남은 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| WebView 버전 차이. 140 미만은 safe-area 미지원, 144 미만은 IME bottom 버그. 이번 검증은 153 한 버전뿐 | 구형 WebView 기기에서 레이아웃이 어긋남 | 버전을 확인해 CSS 변수를 주입하는 폴백(코드는 검증됨). API 35 기기라도 WebView는 Play로 갱신되므로 대부분 최신 [추론] |
| MessagePort 전송의 수명 문제: 문서마다 포트를 새로 받아야 하고, 로드 초기 대기열, bfcache에서 복원된 문서의 포트 상태 | 새로고침·뒤로가기 직후 호출 유실 | `onPageStarted`에서 초기화, JS는 포트를 받기 전 요청을 대기열에 둔다. **bfcache 복원(`pageshow` persisted)은 미검증** → M4에서 테스트 |
| 첫 브리지 호출이 가끔 150~300ms 걸림(원인 미조사) | 초기 로드 체감 | release 빌드에서 재측정하고, 시작 직후 호출(예: `getState`)을 init.js 값으로 대체 |
| 촬영 중 프로세스 사망 시 결과 유실(검증) | 저사양 기기에서 사진 유실 | §4.3 복원 설계 |
| 실기기 카메라 앱의 편차: 일부 OEM 앱이 `content://` 출력에 `openFile` 외의 경로를 쓰거나, `EXTRA_OUTPUT`을 무시하고 `data`에 썸네일만 줄 수 있음 | `takePhoto` 실패 | `openFile`은 `openAssetFile`/`openTypedAssetFile`의 기본 경로라 대부분 동작 [추론]. 파일이 비어 있으면 `data.extras["data"]`(썸네일)로 폴백하는 것을 검토. 실기기 테스트는 MVP 이후 |
| 앱이 `interactive-widget`이나 WebView 기본 동작에 기대면 iOS·Android 키보드 동작이 다름 | 플랫폼마다 레이아웃 차이 | 셸이 "resize/pan"을 명시적으로 고르고 문서화 |
| 에뮬레이터 콜드 부팅 직후 10초 폰트 조회 멈춤(1회 관찰) | 자동 테스트 불안정 | 부팅 후 여유를 두거나 첫 실행을 버림 |
| kotlinc(Homebrew)가 최신 JRE(27)에서 돌고 `-jvm-target 17`로 출력 | 툴체인이 갱신되면 깨질 수 있음 | CLI-10에서 kotlinc 버전 고정. d8이 받는 class 버전을 doctor에서 확인 |
| R8 keep 규칙 누락 | release에서만 크래시 | 셸 진입점(Activity/Provider), `@JavascriptInterface`(쓴다면), 생성된 플러그인 목록은 직접 참조라 안전. 리플렉션 금지를 규칙으로 둔다 |
| 범위를 벗어난 Range가 416이 아니라 네트워크 에러 | 미디어 요소가 끝을 넘어 요청하는 드문 경우 | 영향이 작다. 기록만 해 둔다 |
| 이번 검증은 API 37 에뮬레이터 한 대. minSdk 35(Android 15)·API 36 동작은 미검증 | 동작 차이 가능 | API 35 AVD를 하나 추가해 같은 테스트 페이지를 돌린다(§2.10 명령 그대로) |
